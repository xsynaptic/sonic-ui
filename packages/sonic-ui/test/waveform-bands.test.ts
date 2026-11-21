import { assert, expect, test } from 'vitest';

import type { TintCell, TintPalette } from '#lib/wave-tint.ts';
import type { TintSources, WaveformBands } from '#lib/waveform-bands.ts';
import type { WaveformPeaks } from '#lib/waveform-buckets.ts';

import { oklchOf } from '#lib/oklch.ts';
import { tintTable } from '#lib/wave-tint.ts';
import { bandTable, tintReadiness, tintStrip } from '#lib/waveform-bands.ts';

// A black-to-white palette makes each pixel's lightness equal to its palette position
const greyRamp: TintPalette = {
	peaksDepth: 0,
	steps: 0,
	stops: [
		{ chroma: 0, hue: 0, lightness: 0 },
		{ chroma: 0, hue: 0, lightness: 1 },
	],
	surfaceLightness: 0,
};

interface View {
	pixelsPerSecond: number;
	startSeconds: number;
	width: number;
}

function stripOf(
	sources: TintSources,
	cell: TintCell,
	{ smoothingSeconds = 0, ...view }: View & { smoothingSeconds?: number },
): NonNullable<ReturnType<typeof tintStrip>> {
	const strip = tintStrip(
		sources,
		{ cell, sensitivity: 12, smoothingSeconds, table: tintTable(cell, greyRamp) },
		view,
	);
	assert(strip, 'The tint drew no strip');

	return strip;
}

function positionsOf(pixels: Uint8ClampedArray, count: number): Array<number> {
	return Array.from({ length: count }, (_pixel, index) => {
		const [red = 0, green = 0, blue = 0] = pixels.subarray(index * 4, index * 4 + 3);

		return Math.round(oklchOf([red, green, blue]).lightness * 100) / 100;
	});
}

// Two bands stored as bytes across 60 dB, so each byte step is 60 / 255 dB
function twoBands(frames: Array<[number, number]>, medians = [128, 128]): WaveformBands {
	return {
		bandCount: 2,
		framesPerSecond: 20,
		levels: Uint8Array.from(frames.flat()),
		medians,
		minDecibels: -60,
	};
}

function withoutMedians({ medians: _medians, ...bands }: WaveformBands): WaveformBands {
	return bands;
}

const oneFrameEach = { pixelsPerSecond: 20, startSeconds: 0 };

test('balance reads each band against its own median, not against the other band', () => {
	const sources = {
		bands: bandTable(
			twoBands(
				[
					[200, 100],
					[200, 200],
					[100, 200],
				],
				[200, 100],
			),
		),
		peaks: undefined,
	};
	const { base, count } = stripOf(sources, { hue: 'spectral' }, { ...oneFrameEach, width: 3 });

	// A difference of 100 bytes is 23.5 dB, which is past either end at a sensitivity of 12
	expect(positionsOf(base, count)).toEqual([0.5, 1, 1]);
});

test('balance limits each band to 24 dB from its median before taking the difference', () => {
	const sources = {
		bands: bandTable(
			twoBands(
				[
					[0, 255],
					[128, 255],
				],
				[128, 128],
			),
		),
		peaks: undefined,
	};
	const strip = tintStrip(
		sources,
		{
			cell: { hue: 'spectral' },
			sensitivity: 48,
			smoothingSeconds: 0,
			table: tintTable({ hue: 'spectral' }, greyRamp),
		},
		{ ...oneFrameEach, width: 2 },
	);
	assert(strip);

	// Silence sits 30 dB under the median and the highs 30 dB over it, and each counts as only 24
	expect(positionsOf(strip.base, strip.count)).toEqual([1, 0.75]);
});

test('smoothing averages the band readings over a time, and a group past each end feeds it', () => {
	const frames: Array<[number, number]> = Array.from({ length: 9 }, (_frame, index) => [
		128,
		index === 4 ? 179 : 128,
	]);
	const sources = { bands: bandTable(twoBands(frames)), peaks: undefined };
	const view = { pixelsPerSecond: 20, startSeconds: 0.1, width: 5 };
	const sharp = stripOf(sources, { hue: 'spectral' }, view);
	const smooth = stripOf(sources, { hue: 'spectral' }, { ...view, smoothingSeconds: 0.15 });

	// A rise of 51 bytes is 12 dB, a full step at this sensitivity, and smoothing spreads a third of it to each neighbour
	expect(sharp.x).toBe(-1);
	expect(positionsOf(sharp.base, sharp.count)).toEqual([0.5, 0.5, 0.5, 1, 0.5, 0.5, 0.5]);
	expect(positionsOf(smooth.base, smooth.count)).toEqual([0.5, 0.5, 0.67, 0.67, 0.67, 0.5, 0.5]);
});

test('a window moved by a third of a group keeps every colour and shifts only x', () => {
	const levels = Uint8Array.from({ length: 2 * 400 }, (_level, index) => (index * 37) % 256);
	const bands = bandTable({
		bandCount: 2,
		framesPerSecond: 43.07,
		levels,
		medians: [100, 90],
		minDecibels: -48,
	});
	const groupSeconds = 4 / 43.07;
	const view = { pixelsPerSecond: 10, width: 30 };
	const cell: TintCell = { dynamics: 'onsets', hue: 'spectral' };
	const before = stripOf({ bands, peaks: undefined }, cell, {
		...view,
		startSeconds: 12 * groupSeconds,
	});
	const after = stripOf({ bands, peaks: undefined }, cell, {
		...view,
		startSeconds: (12 + 1 / 3) * groupSeconds,
	});

	expect(before.groupWidth).toBeCloseTo(40 / 43.07, 9);
	expect(after.x).toBeCloseTo(before.x - before.groupWidth / 3, 9);
	expect(after.base).toEqual(before.base);
	expect(after.peaks).toEqual(before.peaks);
	expect(new Set(positionsOf(before.base, before.count)).size).toBeGreaterThan(4);
});

test('rms with no hue source reads the peaks alone, grouped by pairs, and every pixel is opaque', () => {
	const rms = Int16Array.from([1000, 2000, 4000, 8000, 16_000, 0]);
	const peaks: WaveformPeaks = {
		pairsPerSecond: 4,
		rms,
		rmsRange: [2000, 16_000],
		samples: new Int16Array(12),
	};
	const strip = stripOf(
		{ bands: undefined, peaks },
		{ dynamics: 'energy' },
		{ pixelsPerSecond: 4, startSeconds: 0, width: 6 },
	);

	expect(strip.groupWidth).toBe(1);
	expect(positionsOf(strip.base, strip.count)).toEqual([0, 0, 0.33, 0.67, 1, 0]);
	expect(
		strip.base.filter((_channel, index) => index % 4 === 3).every((alpha) => alpha === 255),
	).toBe(true);
});

test('a group of frames takes the mean onset of its frames, and onsets need no medians', () => {
	const frames: Array<[number, number]> = [
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[51, 0],
		[51, 0],
		[51, 0],
		[51, 0],
	];
	const bands = bandTable(withoutMedians(twoBands(frames)));
	const sources = { bands, peaks: undefined };
	const strip = stripOf(
		sources,
		{ dynamics: 'onsets' },
		{ pixelsPerSecond: 10, startSeconds: 0, width: 4 },
	);

	// Frame 4 rises 12 dB, a full onset, and frame 5 rises 9 dB, so the group holding both takes their mean
	expect(strip.groupWidth).toBe(1);
	expect(positionsOf(strip.base, strip.count).slice(0, 3)).toEqual([0.15, 0.15, 0.89]);
});

test('a tint that lacks its reference names it, and one with no data names nothing', () => {
	const bands = bandTable(twoBands([[1, 1]]));
	const bare = bandTable(withoutMedians(twoBands([[1, 1]])));
	const peaks: WaveformPeaks = {
		pairsPerSecond: 4,
		rms: new Int16Array(2),
		samples: new Int16Array(4),
	};

	expect(tintReadiness({ hue: 'spectral' }, { bands: bare, peaks: undefined })).toEqual({
		isReady: false,
		missing: 'bands.medians',
	});
	expect(tintReadiness({ dynamics: 'energy', hue: 'spectral' }, { bands, peaks })).toEqual({
		isReady: false,
		missing: 'peaks.rmsRange',
	});
	expect(
		tintReadiness({ dynamics: 'energy' }, { bands, peaks: { ...peaks, rmsRange: [3, 3] } }),
	).toMatchObject({ missing: 'peaks.rmsRange' });
	expect(tintReadiness({ hue: 'spectral' }, { bands: undefined, peaks })).toEqual({
		isReady: false,
		missing: undefined,
	});
	expect(
		tintReadiness(
			{ hue: 'spectral' },
			{ bands: bandTable({ ...twoBands([]), bandCount: 1 }), peaks },
		),
	).toEqual({ isReady: false, missing: undefined });
	expect(
		tintReadiness({ dynamics: 'energy' }, { bands, peaks: { ...peaks, rmsRange: [1, 3] } }),
	).toEqual({
		grid: { unitCount: 2, unitsPerSecond: 4 },
		isReady: true,
	});
});

test('medians shorter than the band count are no medians, and linear levels read in decibels', () => {
	const short = bandTable({ ...twoBands([[1, 1]]), medians: [1] });
	const linear = bandTable({
		bandCount: 1,
		framesPerSecond: 10,
		levels: new Float32Array([0.5, 0]),
	});

	expect(short?.medians).toBeUndefined();
	expect(linear?.decibelsOf(0.5)).toBeCloseTo(-6.02, 2);
	expect(linear?.decibelsOf(0)).toBe(-120);
	expect(bandTable({ ...twoBands([]), framesPerSecond: 0 })).toBeUndefined();
});

test('the peaks zone strip is the base strip moved halfway to the surface, group for group', () => {
	const sources = {
		bands: bandTable(
			twoBands([
				[128, 128],
				[128, 179],
				[179, 128],
			]),
		),
		peaks: undefined,
	};
	const strip = tintStrip(
		sources,
		{
			cell: { hue: 'spectral' },
			sensitivity: 12,
			smoothingSeconds: 0,
			table: tintTable(
				{ hue: 'spectral' },
				{ ...greyRamp, peaksDepth: 0.5, surfaceLightness: 0.2 },
			),
		},
		{ ...oneFrameEach, width: 3 },
	);
	assert(strip);

	expect(positionsOf(strip.base, strip.count)).toEqual([0.5, 1, 0]);
	expect(positionsOf(strip.peaks, strip.count)).toEqual([0.35, 0.6, 0.1]);
});

test('groups of several frames cover the window and one group past each end, placed by absolute frame', () => {
	const bands = bandTable(
		twoBands(Array.from({ length: 100 }, () => [128, 128] as [number, number])),
	);
	const strip = stripOf(
		{ bands, peaks: undefined },
		{ hue: 'spectral' },
		{ pixelsPerSecond: 5, startSeconds: 1.1, width: 6 },
	);

	// At 20 frames and 5 pixels a second each group holds 4 frames, and the window opens at frame 22
	expect(strip.groupWidth).toBe(1);
	expect(strip.x).toBeCloseTo(-1.5, 9);
	expect(strip.count).toBe(9);
});

test('rms on a frame grid folds every pair inside the frame, and a spectral reading dims by it', () => {
	const frames: Array<[number, number]> = [
		[128, 128],
		[128, 128],
	];
	const peaks: WaveformPeaks = {
		pairsPerSecond: 80,
		rms: Int16Array.from([4000, 4000, 4000, 4000, 1000, 1000, 1000, 16_000]),
		rmsRange: [1000, 16_000],
		samples: new Int16Array(16),
	};
	const strip = stripOf(
		{ bands: bandTable(twoBands(frames)), peaks },
		{ dynamics: 'energy', hue: 'spectral' },
		{ ...oneFrameEach, width: 2 },
	);
	const loud = Math.sqrt((3 * 1000 ** 2 + 16_000 ** 2) / 4);
	const reading = (rms: number): number => Math.log(rms / 1000) / Math.log(16);

	const [quiet, loudest] = positionsOf(strip.base, strip.count);

	// A stored pixel keeps lightness to about a hundredth
	expect(quiet).toBeCloseTo(0.5 * (0.55 + 0.45 * reading(4000)), 1.7);
	expect(loudest).toBeCloseTo(0.5 * (0.55 + 0.45 * reading(loud)), 1.7);
});

test('smoothing at the start of the track averages only the frames that exist', () => {
	const frames: Array<[number, number]> = [
		[128, 179],
		[128, 128],
		[128, 128],
		[128, 128],
	];
	const strip = stripOf(
		{ bands: bandTable(twoBands(frames)), peaks: undefined },
		{ hue: 'spectral' },
		{ ...oneFrameEach, smoothingSeconds: 0.15, width: 3 },
	);

	expect(strip.x).toBe(0);
	expect(positionsOf(strip.base, strip.count)).toEqual([0.75, 0.67, 0.5, 0.5]);
});

test('an onset in any band counts, not only the lowest', () => {
	const frames: Array<[number, number]> = [
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 51],
	];
	const bands = bandTable(withoutMedians(twoBands(frames)));
	const strip = stripOf(
		{ bands, peaks: undefined },
		{ dynamics: 'onsets' },
		{ ...oneFrameEach, width: 5 },
	);

	expect(positionsOf(strip.base, strip.count).at(-1)).toBe(1);
});

test('energy needs peaks with rms, and a strip needs a rate and a window inside the track', () => {
	const bands = bandTable(twoBands([[128, 128]]));
	const peaks: WaveformPeaks = { pairsPerSecond: 4, rmsRange: [1, 3], samples: new Int16Array(4) };
	const settings = {
		cell: { hue: 'spectral' },
		sensitivity: 12,
		smoothingSeconds: 0,
		table: tintTable({ hue: 'spectral' }, greyRamp),
	} as const;

	expect(tintReadiness({ dynamics: 'energy' }, { bands, peaks: undefined })).toEqual({
		isReady: false,
		missing: undefined,
	});
	expect(tintReadiness({ dynamics: 'energy' }, { bands, peaks })).toEqual({
		isReady: false,
		missing: undefined,
	});
	expect(
		tintStrip({ bands, peaks: undefined }, settings, {
			...oneFrameEach,
			pixelsPerSecond: 0,
			width: 4,
		}),
	).toBeUndefined();
	expect(
		tintStrip({ bands, peaks: undefined }, settings, {
			...oneFrameEach,
			startSeconds: 60,
			width: 4,
		}),
	).toBeUndefined();
});

test('a full scale the host sets reads levels against it, and a band count that cannot be read is no table', () => {
	const tenBit = bandTable({
		bandCount: 1,
		framesPerSecond: 10,
		fullScale: 1000,
		levels: new Uint16Array(2),
	});

	expect(tenBit?.decibelsOf(500)).toBeCloseTo(-6.02, 2);
	expect(tenBit?.decibelsOf(2000)).toBe(0);
	expect(bandTable({ ...twoBands([]), bandCount: 0 })).toBeUndefined();
	expect(bandTable({ ...twoBands([]), bandCount: 1.5 })).toBeUndefined();
	expect(bandTable(undefined)).toBeUndefined();
});
