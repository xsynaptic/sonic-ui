import { clampProportion } from '#lib/math.ts';

export interface WaveformBands {
	/** Bands per frame, interleaved in `levels`, lowest first */
	bandCount: number;
	framesPerSecond: number;
	/** Unset follows the array: 255, 65535 or 1 */
	fullScale?: number;
	levels: Float32Array | Uint8Array | Uint16Array;
	/** Reads a level as decibels, from this just above zero up to 0 at full scale; unset means linear */
	minDecibels?: number;
}

export type BandChannels = readonly [number, number, number];

export interface BandTable {
	bandCount: number;
	framesPerSecond: number;
	levels: WaveformBands['levels'];
	weightOf: (level: number) => number;
}

export interface BandMix {
	contrast: number;
	normalize: number;
	tilt: number;
}

interface BandView {
	mix?: BandMix;
	pixelsPerSecond: number;
	startSeconds: number;
	width: number;
}

interface BandStrip {
	count: number;
	groupWidth: number;
	pixels: Uint8ClampedArray<ArrayBuffer>;
	x: number;
}

function fullScaleOf({ fullScale, levels }: WaveformBands): number {
	if (fullScale !== undefined) return fullScale;
	if (levels instanceof Uint8Array) return 255;

	return levels instanceof Uint16Array ? 65_535 : 1;
}

function amplitudeReader(bands: WaveformBands): (level: number) => number {
	const fullScale = fullScaleOf(bands);
	const minDecibels = Math.min(0, bands.minDecibels ?? 0);

	return (level) => {
		const proportion = Math.min(1, level / fullScale);
		if (!(proportion > 0)) return 0;

		return minDecibels < 0 ? 10 ** ((minDecibels * (1 - proportion)) / 20) : proportion;
	};
}

export function bandTable(bands: undefined | WaveformBands): BandTable | undefined {
	if (!bands) return undefined;

	const { bandCount, framesPerSecond, levels } = bands;
	if (!Number.isSafeInteger(bandCount) || bandCount < 1 || !(framesPerSecond > 0)) return undefined;

	const amplitudeOf = amplitudeReader(bands);
	if (levels instanceof Float32Array) {
		return { bandCount, framesPerSecond, levels, weightOf: amplitudeOf };
	}

	const weights = Float32Array.from(
		{ length: levels instanceof Uint8Array ? 256 : 65_536 },
		(_weight, level) => amplitudeOf(level),
	);

	return { bandCount, framesPerSecond, levels, weightOf: (level) => weights[level] ?? 0 };
}

// Loudness is the envelope's height, so the mix is hue: scaled to its strongest channel, or averaged to stay inside the palette
function groupMixer(
	{ bandCount, levels, weightOf }: BandTable,
	colours: ReadonlyArray<BandChannels | undefined>,
	{ contrast, normalize, tilt }: BandMix,
): (fromFrame: number, toFrame: number) => [number, number, number, number] | undefined {
	const gains = Array.from({ length: bandCount }, (_gain, band) => 10 ** ((tilt * band) / 20));
	const amount = clampProportion(normalize);

	return (fromFrame, toFrame) => {
		let red = 0;
		let green = 0;
		let blue = 0;
		let total = 0;

		for (let band = 0; band < bandCount; band += 1) {
			const colour = colours[band];
			if (!colour) continue;

			let weight = 0;

			for (let bandFrame = fromFrame; bandFrame < toFrame; bandFrame += 1) {
				weight += weightOf(levels[bandFrame * bandCount + band] ?? 0);
			}
			weight *= gains[band] ?? 1;
			if (contrast !== 1) weight **= contrast;
			red += weight * colour[0];
			green += weight * colour[1];
			blue += weight * colour[2];
			total += weight;
		}
		if (total === 0) return;

		const full = 255 / Math.max(red, green, blue, Number.MIN_VALUE);
		const scale = full * amount + (1 - amount) / total;

		return [red * scale, green * scale, blue * scale, 255];
	};
}

// Keyed to absolute frames, as buckets are to pairs; keyed to the window, the colours shimmer as it scrolls
export function bandStrip(
	table: BandTable,
	colours: ReadonlyArray<BandChannels | undefined>,
	view: BandView,
): BandStrip | undefined {
	if (view.pixelsPerSecond <= 0 || !colours.some(Boolean)) return undefined;

	const { bandCount, framesPerSecond, levels } = table;
	const mixGroup = groupMixer(table, colours, view.mix ?? { contrast: 1, normalize: 1, tilt: 0 });
	const pxPerFrame = view.pixelsPerSecond / framesPerSecond;
	const frames = Math.max(1, Math.round(1 / pxPerFrame));
	const groupWidth = frames * pxPerFrame;
	const openingFrame = view.startSeconds * framesPerSecond;
	const groupsTotal = Math.ceil(levels.length / bandCount / frames);
	// A group past each end, so the smoothing at the image's own edges falls outside the window
	const first = Math.max(0, Math.floor(openingFrame / frames) - 1);
	const last = Math.min(
		groupsTotal,
		Math.ceil((openingFrame + view.width / pxPerFrame) / frames) + 1,
	);
	const count = last - first;
	if (count < 1) return undefined;

	const pixels = new Uint8ClampedArray(count * 4);

	for (let index = 0; index < count; index += 1) {
		const fromFrame = (first + index) * frames;
		const mixed = mixGroup(fromFrame, fromFrame + frames);

		if (mixed) pixels.set(mixed, index * 4);
	}

	return { count, groupWidth, pixels, x: (first * frames - openingFrame) * pxPerFrame };
}
