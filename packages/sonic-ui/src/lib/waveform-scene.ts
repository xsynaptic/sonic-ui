import type { View } from '#lib/frame-timeline.ts';
import type { WaveformPeaks } from '#lib/waveform-buckets.ts';

import { isKind } from '#lib/marker-band.ts';
import { clamp } from '#lib/math.ts';
import { waveformBuckets } from '#lib/waveform-buckets.ts';

type Colour = keyof typeof waveformColours;

interface Scene extends View {
	colours: Record<Colour, string>;
}

interface Drawn {
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
	wave: '--_sonic-waveform-wave',
	waveEdge: '--_sonic-waveform-wave-edge',
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

function waveFill(context: CanvasRenderingContext2D, scene: Scene): CanvasGradient {
	const { wave, waveEdge } = scene.colours;
	const gradient = context.createLinearGradient(0, 0, 0, scene.height);

	gradient.addColorStop(0, waveEdge);
	gradient.addColorStop(0.5, wave);
	gradient.addColorStop(1, waveEdge);

	return gradient;
}

function paintWave(context: CanvasRenderingContext2D, scene: Scene, peaks: WaveformPeaks): void {
	const buckets = waveformBuckets(peaks, scene);
	const [first] = buckets;
	if (!first) return;

	const center = scene.height / 2;
	const amplitudePx = center * amplitudeMargin;

	context.fillStyle = waveFill(context, scene);
	context.beginPath();
	context.moveTo(first.x, center);
	for (const bucket of buckets) context.lineTo(bucket.x, center - bucket.high * amplitudePx);
	for (const bucket of buckets.toReversed())
		context.lineTo(bucket.x, center - bucket.low * amplitudePx);
	context.closePath();
	context.fill();
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
	paintHatch(context, scene, [0, from]);
	paintHatch(context, scene, [to, width]);
	context.fillStyle = grid;
	if (to > from) context.fillRect(from, Math.round((height - line) / 2), to - from, line);
	paintPlaceholders(context, scene);
	if (drawn.peaks) paintWave(context, scene, drawn.peaks);
	// Scrolling lines sit at fractional x; rounding them judders
	context.fillStyle = ends;
	for (const edge of [opening, closing]) context.fillRect(edge - line / 2, 0, line, height);
	paintMarkers(context, scene, drawn);
}
