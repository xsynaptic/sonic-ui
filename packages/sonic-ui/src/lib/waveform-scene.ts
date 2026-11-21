import type { View } from '#lib/frame-timeline.ts';
import type { TintSettings, TintSources, TintStrip } from '#lib/waveform-bands.ts';
import type { WaveformPeaks } from '#lib/waveform-buckets.ts';

import { isKind } from '#lib/marker-band.ts';
import { clamp } from '#lib/math.ts';
import { tintStrip } from '#lib/waveform-bands.ts';
import { waveformBuckets } from '#lib/waveform-buckets.ts';

type Colour = keyof typeof waveformColours;

type Numeric = keyof typeof waveformNumbers;

interface Scene extends View {
	colours: Record<Colour, string>;
	numbers: Record<Numeric, number>;
}

export interface WaveformTint {
	settings: TintSettings;
	sources: TintSources;
	strip: CanvasRenderingContext2D;
}

interface Envelope {
	body: Path2D | undefined;
	wave: Path2D;
}

interface Drawn {
	kindColours: ReadonlyMap<string, string>;
	markers: ReadonlyArray<{ dimmed?: boolean; kind?: string; start: number }>;
	peaks: undefined | WaveformPeaks;
	range: [number, number];
	tint: undefined | WaveformTint;
}

export const waveformColours = {
	base: '--_sonic-waveform-base',
	ends: '--_sonic-waveform-ends',
	grid: '--_sonic-waveform-grid',
	marker: '--_sonic-waveform-marker',
	peaks: '--_sonic-waveform-peaks',
	placeholder: '--_sonic-waveform-placeholder',
	shade: '--_sonic-waveform-shade',
	shadeClear: '--_sonic-waveform-shade-clear',
} as const;

export const waveformNumbers = {
	edgeShade: '--_sonic-waveform-edge-shade',
	peaksDepth: '--_sonic-waveform-peaks-depth',
	tintOff: '--_sonic-waveform-tint-off',
	tintSensitivity: '--_sonic-waveform-tint-sensitivity',
	tintSmoothing: '--_sonic-waveform-tint-smoothing',
	tintSteps: '--_sonic-waveform-tint-steps',
} as const;

const amplitudeMargin = 0.94;
const pastTheWave = 2;

const hatchPitchPx = 8;
const placeholderWavelengthPx = 48;
const placeholderAmplitude = 0.2;

function paintHatch(
	context: CanvasRenderingContext2D,
	scene: Scene,
	[from, to]: [number, number],
): void {
	if (to <= from) return;

	const { dpr, height } = scene;
	const pitch = Math.max(2, Math.round(hatchPitchPx * dpr));
	const offset = scene.startSeconds * scene.pixelsPerSecond;

	context.save();
	context.beginPath();
	context.rect(from, 0, to - from, height);
	context.clip();
	context.beginPath();
	for (let x = Math.floor((from - height + offset) / pitch) * pitch - offset; x < to; x += pitch) {
		context.moveTo(x, height);
		context.lineTo(x + height, 0);
	}
	context.lineWidth = Math.max(1, Math.round(dpr));
	context.strokeStyle = scene.colours.ends;
	context.stroke();
	context.restore();
}

function paintPlaceholders(context: CanvasRenderingContext2D, scene: Scene): void {
	if (scene.pending.length === 0) return;

	const { dpr, height, pixelsPerSecond, startSeconds } = scene;
	const wavelength = placeholderWavelengthPx * dpr;
	const center = height / 2;
	const origin = startSeconds * pixelsPerSecond;
	const waveY = (x: number): number =>
		center -
		Math.sin(((x + origin) / wavelength + scene.phase) * 2 * Math.PI) *
			center *
			placeholderAmplitude;

	context.beginPath();
	for (const [from, to] of scene.pending) {
		const opening = (from - startSeconds) * pixelsPerSecond;
		const closing = (to - startSeconds) * pixelsPerSecond;

		context.moveTo(opening, waveY(opening));
		for (let x = opening + dpr; x < closing; x += dpr) context.lineTo(x, waveY(x));
		context.lineTo(closing, waveY(closing));
	}
	context.lineWidth = Math.max(1, Math.round(dpr));
	context.strokeStyle = scene.colours.placeholder;
	context.stroke();
}

function drawStrip(
	context: CanvasRenderingContext2D,
	scene: Scene,
	[strip, placed, pixels]: [CanvasRenderingContext2D, TintStrip, Uint8ClampedArray<ArrayBuffer>],
): void {
	const { canvas } = strip;
	const { count, groupWidth, x } = placed;

	if (canvas.width < count) canvas.width = count;
	strip.putImageData(new ImageData(pixels, count, 1), 0, 0);
	context.drawImage(canvas, 0, 0, count, 1, x, 0, count * groupWidth, scene.height);
}

// Painting each zone over the last is cheaper on the GPU than cutting out the peaks zone with an even-odd ring
function paintZones(
	context: CanvasRenderingContext2D,
	scene: Scene,
	[tint, { body, wave }]: [undefined | WaveformTint, Envelope],
): void {
	const placed = tint && tintStrip(tint.sources, tint.settings, scene);

	context.fillStyle = body ? scene.colours.peaks : scene.colours.base;
	context.fill(wave);
	// The flat envelope is the mask: from here only the pixels it covers take colour
	context.globalCompositeOperation = 'source-atop';
	if (!tint || !placed) {
		if (!body) return;

		context.fillStyle = scene.colours.base;
		context.fill(body);
		return;
	}
	if (!body) {
		drawStrip(context, scene, [tint.strip, placed, placed.base]);
		return;
	}

	drawStrip(context, scene, [tint.strip, placed, placed.peaks]);
	context.save();
	context.clip(body);
	drawStrip(context, scene, [tint.strip, placed, placed.base]);
	context.restore();
}

function paintEdgeShade(context: CanvasRenderingContext2D, scene: Scene): void {
	const { shade, shadeClear } = scene.colours;
	const gradient = context.createLinearGradient(0, 0, 0, scene.height);

	gradient.addColorStop(0, shade);
	gradient.addColorStop(0.5, shadeClear);
	gradient.addColorStop(1, shade);
	context.globalAlpha = scene.numbers.edgeShade;
	context.fillStyle = gradient;
	context.fillRect(0, 0, scene.width, scene.height);
}

function outline(
	buckets: ReadonlyArray<{ high: number; low: number; x: number }>,
	[center, amplitudePx]: [number, number],
): Path2D {
	const path = new Path2D();
	const [first] = buckets;
	if (!first) return path;

	path.moveTo(first.x, center);
	for (const bucket of buckets) path.lineTo(bucket.x, center - bucket.high * amplitudePx);
	for (const bucket of buckets.toReversed())
		path.lineTo(bucket.x, center - bucket.low * amplitudePx);
	path.closePath();

	return path;
}

function paintWave(context: CanvasRenderingContext2D, scene: Scene, drawn: Drawn): void {
	const buckets = drawn.peaks ? waveformBuckets(drawn.peaks, scene) : [];
	if (buckets.length === 0) return;

	const center = scene.height / 2;
	const scale: [number, number] = [center, center * amplitudeMargin];
	const wave = outline(buckets, scale);
	// Where the body meets the wave's edge it runs past it, or the edge keeps a rim of the peaks colour
	const body = buckets.some((bucket) => bucket.body)
		? outline(
				buckets.map(({ body: span, high, low, x }) => ({
					high: span && span.high < high ? span.high : pastTheWave,
					low: span && span.low > low ? span.low : -pastTheWave,
					x,
				})),
				scale,
			)
		: undefined;

	paintZones(context, scene, [drawn.tint, { body, wave }]);
	if (scene.numbers.edgeShade > 0) paintEdgeShade(context, scene);
	context.globalAlpha = 1;
}

function paintMarkers(context: CanvasRenderingContext2D, scene: Scene, drawn: Drawn): void {
	const line = Math.max(1, Math.round(scene.dpr));

	for (const { dimmed, kind, start } of drawn.markers) {
		const x = (start - scene.startSeconds) * scene.pixelsPerSecond;

		context.fillStyle =
			(isKind(kind) ? drawn.kindColours.get(kind) : undefined) ?? scene.colours.marker;
		context.globalAlpha = dimmed === true ? 0.5 : 1;
		context.fillRect(x - line / 2, 0, line, scene.height);
	}
	context.globalAlpha = 1;
}

export function paintWaveform(context: CanvasRenderingContext2D, scene: Scene, drawn: Drawn): void {
	const { dpr, height, pixelsPerSecond, startSeconds, width } = scene;
	const x = (seconds: number): number => (seconds - startSeconds) * pixelsPerSecond;
	const { ends, grid } = scene.colours;
	const line = Math.max(1, Math.round(dpr));
	const [opening, closing] = [x(drawn.range[0]), x(drawn.range[1])];
	const [from, to] = [clamp(opening, 0, width), clamp(closing, 0, width)];

	context.clearRect(0, 0, width, height);
	paintWave(context, scene, drawn);
	// Laid under the wave, so the nearest is painted first
	context.globalCompositeOperation = 'destination-over';
	paintPlaceholders(context, scene);
	context.fillStyle = grid;
	if (to > from) context.fillRect(from, Math.round((height - line) / 2), to - from, line);
	paintHatch(context, scene, [0, from]);
	paintHatch(context, scene, [to, width]);
	context.globalCompositeOperation = 'source-over';
	// Scrolling lines sit at fractional x; rounding them judders
	context.fillStyle = ends;
	for (const edge of [opening, closing]) context.fillRect(edge - line / 2, 0, line, height);
	paintMarkers(context, scene, drawn);
}
