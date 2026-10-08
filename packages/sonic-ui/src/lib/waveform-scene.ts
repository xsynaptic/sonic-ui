import type { View } from '#lib/frame-timeline.ts';
import type { BandChannels, BandTable } from '#lib/waveform-bands.ts';
import type { WaveformPeaks } from '#lib/waveform-buckets.ts';

import { isKind } from '#lib/marker-band.ts';
import { clamp } from '#lib/math.ts';
import { bandStrip } from '#lib/waveform-bands.ts';
import { waveformBuckets } from '#lib/waveform-buckets.ts';

type Colour = keyof typeof waveformColours;

type Numeric = keyof typeof waveformNumbers;

interface Scene extends View {
	colours: Record<Colour, string>;
	numbers: Record<Numeric, number>;
}

export interface WaveformTint {
	colours: ReadonlyArray<BandChannels | undefined>;
	strip: CanvasRenderingContext2D;
	table: BandTable;
}

interface Drawn {
	bands: undefined | WaveformTint;
	kindColours: ReadonlyMap<string, string>;
	markers: ReadonlyArray<{ dimmed?: boolean; kind?: string; start: number }>;
	peaks: undefined | WaveformPeaks;
	range: [number, number];
}

export const waveformColours = {
	ends: '--_sonic-waveform-ends',
	grid: '--_sonic-waveform-grid',
	marker: '--_sonic-waveform-marker',
	placeholder: '--_sonic-waveform-placeholder',
	shade: '--_sonic-waveform-shade',
	shadeClear: '--_sonic-waveform-shade-clear',
	wave: '--_sonic-waveform-wave',
} as const;

export const waveformNumbers = {
	bandContrast: '--_sonic-waveform-band-contrast',
	bandNormalize: '--_sonic-waveform-band-normalize',
	bandOpacity: '--_sonic-waveform-band-opacity',
	bandTilt: '--_sonic-waveform-band-tilt',
	edgeShade: '--_sonic-waveform-edge-shade',
} as const;

const amplitudeMargin = 0.94;

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

// A painted pixel is the one reading that resolves any colour syntax to channels
export function bandChannels(
	strip: CanvasRenderingContext2D,
	colour: string,
): BandChannels | undefined {
	strip.clearRect(0, 0, 1, 1);
	strip.fillStyle = colour;
	strip.fillRect(0, 0, 1, 1);

	const [red = 0, green = 0, blue = 0, alpha = 0] = strip.getImageData(0, 0, 1, 1).data;

	return alpha === 0 ? undefined : [red, green, blue];
}

function paintTint(context: CanvasRenderingContext2D, scene: Scene, tint: WaveformTint): void {
	const { bandContrast, bandNormalize, bandTilt } = scene.numbers;
	const strip = bandStrip(tint.table, tint.colours, {
		...scene,
		mix: { contrast: bandContrast, normalize: bandNormalize, tilt: bandTilt },
	});
	if (!strip) return;

	const { canvas } = tint.strip;
	const { count } = strip;

	if (canvas.width < count) canvas.width = count;
	tint.strip.putImageData(new ImageData(strip.pixels, count, 1), 0, 0);
	context.globalAlpha = scene.numbers.bandOpacity;
	context.drawImage(canvas, 0, 0, count, 1, strip.x, 0, count * strip.groupWidth, scene.height);
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

function paintWave(context: CanvasRenderingContext2D, scene: Scene, drawn: Drawn): void {
	const buckets = drawn.peaks ? waveformBuckets(drawn.peaks, scene) : [];
	const [first] = buckets;
	if (!first) return;

	const center = scene.height / 2;
	const amplitudePx = center * amplitudeMargin;
	const { bandOpacity, edgeShade } = scene.numbers;

	context.fillStyle = scene.colours.wave;
	context.beginPath();
	context.moveTo(first.x, center);
	for (const bucket of buckets) context.lineTo(bucket.x, center - bucket.high * amplitudePx);
	for (const bucket of buckets.toReversed())
		context.lineTo(bucket.x, center - bucket.low * amplitudePx);
	context.closePath();
	context.fill();
	// The flat envelope is the mask: from here only the pixels it covers take colour
	context.globalCompositeOperation = 'source-atop';
	if (drawn.bands && bandOpacity > 0) paintTint(context, scene, drawn.bands);
	if (edgeShade > 0) paintEdgeShade(context, scene);
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
