import { expect, test } from 'vitest';

import type { Oklch } from '#lib/oklch.ts';
import type { TintCell, TintPalette } from '#lib/wave-tint.ts';

import { blendOklch, oklchOf, rgbOf } from '#lib/oklch.ts';
import {
	balanceOf,
	energyReading,
	isLevelRange,
	onsetAt,
	parseTintDynamics,
	parseTintHue,
	samplePalette,
	steppedPosition,
	tintCellOf,
	tintTable,
	zoneColours,
} from '#lib/wave-tint.ts';

function colour(lightness: number, chroma: number, hue: number): Oklch {
	return { chroma, hue, lightness };
}

const palette: TintPalette = {
	peaksDepth: 0.6,
	steps: 0,
	stops: [colour(0.4, 0.1, 30), colour(0.8, 0.16, 90)],
	surfaceLightness: 0.2,
};

function towardSurface(lightness: number): number {
	return lightness + 0.6 * (palette.surfaceLightness - lightness);
}

function rgbAt(bytes: Uint8Array, entry: number): Array<number> {
	return [...bytes.subarray(entry * 3, entry * 3 + 3)];
}

function hueDistance(first: number, second: number): number {
	return Math.abs(((first - second + 540) % 360) - 180);
}

test('sRGB survives the trip through OKLCH, and red lands where CSS puts it', () => {
	for (const channels of [
		[255, 0, 0],
		[12, 200, 37],
		[250, 240, 230],
		[3, 4, 5],
	] as const) {
		expect(rgbOf(oklchOf(channels))).toEqual(channels);
	}

	const red = oklchOf([255, 0, 0]);

	expect(red.lightness).toBeCloseTo(0.628, 3);
	expect(red.chroma).toBeCloseTo(0.2577, 3);
	expect(red.hue).toBeCloseTo(29.23, 1);
});

test('a colour past the sRGB gamut clips each channel rather than wrapping', () => {
	expect(rgbOf(colour(0.9, 0.4, 145))).toEqual([0, 255, 0]);
	expect(rgbOf(colour(-0.2, 0, 0))).toEqual([0, 0, 0]);
});

test('a blend keeps both ends exactly and blends chroma in OKLCH, so it stays as colourful', () => {
	const from = colour(0.4, 0.1, 30);
	const to = colour(0.8, 0.2, 90);
	const middle = blendOklch(from, to, 0.5);

	expect(blendOklch(from, to, 0)).toEqual(from);
	expect(hueDistance(blendOklch(from, to, 1).hue, 90)).toBeLessThan(1e-9);
	expect(middle.lightness).toBeCloseTo(0.6, 9);
	expect(middle.chroma).toBeCloseTo(0.15, 9);
	expect(middle.hue).toBeGreaterThan(60);
	expect(middle.hue).toBeLessThan(75);
	expect(blendOklch(from, to, 2)).toEqual(blendOklch(from, to, 1));
});

test('a grey end pulls no hue, and nothing jumps as a near-grey crosses any chroma', () => {
	const green = colour(0.7, 0.12, 150);

	expect(hueDistance(blendOklch(colour(0.5, 0, 0), green, 0.3).hue, 150)).toBeLessThan(1e-9);

	const hues = [0.018, 0.019, 0.02, 0.021, 0.022].map(
		(chroma) => blendOklch(colour(0.47, chroma, 285), green, 0.6).hue,
	);

	for (const [index, hue] of hues.slice(1).entries()) {
		expect(hueDistance(hue, hues[index] ?? 0)).toBeLessThan(1);
	}
	expect(hueDistance(hues[0] ?? 0, 150)).toBeLessThan(10);
});

test('a host’s low-chroma stop is drawn as set, whatever its neighbour', () => {
	const slate = colour(0.45, 0.019, 250);
	const stops = [slate, colour(0.7, 0.17, 55)];

	expect(samplePalette(stops, 0)).toEqual(slate);
	expect(samplePalette(stops, 0.5).chroma).toBeCloseTo(0.0945, 9);
});

test('three stops are sampled piecewise, and a position past either end holds the end', () => {
	const stops = [colour(0.2, 0, 0), colour(0.6, 0.2, 40), colour(0.7, 0.1, 100)];
	const quarter = samplePalette(stops, 0.25);

	expect(quarter.lightness).toBeCloseTo(0.4, 9);
	expect(quarter.chroma).toBeCloseTo(0.1, 9);
	expect(hueDistance(quarter.hue, 40)).toBeLessThan(1e-9);
	expect(samplePalette(stops, 0.75).lightness).toBeCloseTo(0.65, 9);
	expect(samplePalette(stops, -1)).toEqual(stops[0]);
	expect(hueDistance(samplePalette(stops, 2).hue, 100)).toBeLessThan(1e-9);
	expect(samplePalette([colour(0.5, 0.1, 10)], 0.8)).toEqual(colour(0.5, 0.1, 10));
});

test('steps cut the palette into flat runs that reach both ends', () => {
	expect([0, 0.32, 0.34, 0.66, 0.67, 1].map((position) => steppedPosition(position, 3))).toEqual([
		0, 0, 0.5, 0.5, 1, 1,
	]);
	expect(steppedPosition(0.49, 2)).toBe(0);
	expect(steppedPosition(0.51, 2)).toBe(1);
	expect(steppedPosition(0.37, 1)).toBe(0.37);
	expect(steppedPosition(1.4, 0)).toBe(1);
});

test('balance is the highs over the bass in units of the sensitivity, centred on even', () => {
	expect(balanceOf(6, 12)).toBe(0.75);
	expect(balanceOf(-9, 6)).toBe(0);
	expect(balanceOf(-3, 6)).toBe(0.25);
	expect(balanceOf(30, 0)).toBe(0.5);
});

test('energy is read in decibels between the quiet and loud levels', () => {
	const range = [0.1, 0.4] as const;

	expect(energyReading(0.2, range)).toBeCloseTo(0.5, 9);
	expect(energyReading(0.4 / Math.SQRT2, range)).toBeCloseTo(0.75, 9);
	expect(energyReading(0.05, range)).toBe(0);
	expect(energyReading(0.9, range)).toBe(1);
	expect(energyReading(0, range)).toBe(0);
});

test('attributes take only the values a tint knows, a cell needs one of them, and a range needs a quiet level above silence', () => {
	expect([parseTintHue('spectral'), parseTintHue('Spectral'), parseTintHue('')]).toEqual([
		'spectral',
		undefined,
		undefined,
	]);
	expect([
		parseTintDynamics('energy'),
		parseTintDynamics('onsets'),
		parseTintDynamics('rms'),
	]).toEqual(['energy', 'onsets', undefined]);
	expect(tintCellOf(undefined, undefined)).toBeUndefined();
	expect(tintCellOf(undefined, 'onsets')).toEqual({ dynamics: 'onsets' });
	expect(tintCellOf('spectral', 'energy')).toEqual({ dynamics: 'energy', hue: 'spectral' });
	expect(isLevelRange([0.1, 0.4])).toBe(true);
	expect(isLevelRange([0, 0.4])).toBe(false);
	expect(isLevelRange([0.4, 0.4])).toBe(false);
	expect(isLevelRange(undefined)).toBe(false);
});

test('an onset is the steepest band rise over the mean of the four frames before it', () => {
	const levels = [
		[-30, -20],
		[-30, -22],
		[-30, -18],
		[-30, -20],
		[-27, -14],
	];
	const decibels = (frame: number, band: number): number => levels[frame]?.[band] ?? -120;

	expect(onsetAt(decibels, [4, 2])).toBeCloseTo(0.5, 9);
	expect(onsetAt(decibels, [4, 1])).toBeCloseTo(0.25, 9);
	expect(onsetAt(decibels, [3, 2])).toBe(0);
	expect(onsetAt((frame) => (frame === 5 ? -40 : -10), [5, 1])).toBe(0);
	expect(onsetAt((frame) => (frame === 5 ? 0 : -60), [5, 1])).toBe(1);
});

test('with no hue source energy travels the palette, and the peaks zone moves its share of the way to the surface', () => {
	const { base, peaks } = zoneColours(
		{ dynamics: 'energy' },
		{ balance: 0.9, dynamics: 0.25 },
		palette,
	);

	expect(base).toEqual(samplePalette(palette.stops, 0.25));
	expect(peaks.lightness).toBeCloseTo(0.5 + 0.6 * (0.2 - 0.5), 9);
	expect(peaks.chroma).toBe(base.chroma);
	expect(peaks.hue).toBe(base.hue);
});

test('the peaks zone always lands between its colour and the surface, on a dark surface or a light one', () => {
	const cells: Array<TintCell> = [
		{ dynamics: 'energy' },
		{ hue: 'spectral' },
		{ dynamics: 'energy', hue: 'spectral' },
	];
	const stops = [colour(0.66, 0.2, 28), colour(0.3, 0.05, 250), colour(0.9, 0.1, 90)];

	for (const surfaceLightness of [0.274, 0.97]) {
		for (const cell of cells) {
			for (const reading of [0, 0.3, 1]) {
				const atReading = { balance: reading, dynamics: reading };
				const { base, peaks } = zoneColours(cell, atReading, {
					...palette,
					stops,
					surfaceLightness,
				});
				const [low = 0, high = 1] = [base.lightness, surfaceLightness].toSorted(
					(first, second) => first - second,
				);

				expect(peaks.lightness).toBeGreaterThanOrEqual(low - 1e-9);
				expect(peaks.lightness).toBeLessThanOrEqual(high + 1e-9);
				expect(Math.abs(peaks.lightness - base.lightness)).toBeCloseTo(
					0.6 * Math.abs(surfaceLightness - base.lightness),
					9,
				);
			}
		}
	}
});

test('transients flash the body from the resting colour while the peaks zone stays at rest', () => {
	const quiet = zoneColours({ dynamics: 'onsets' }, { balance: 0, dynamics: 0 }, palette);
	const hit = zoneColours({ dynamics: 'onsets' }, { balance: 0, dynamics: 1 }, palette);
	const rest = samplePalette(palette.stops, 0.15);

	expect(quiet.base).toEqual(rest);
	expect(hit.base).toEqual(samplePalette(palette.stops, 1));
	expect(hit.peaks).toEqual(quiet.peaks);
	expect(quiet.peaks.lightness).toBeCloseTo(rest.lightness + 0.6 * (0.2 - rest.lightness), 9);
});

test('with a hue source energy and onsets move only lightness, and the peaks zone follows', () => {
	const hue = samplePalette(palette.stops, 0.75);
	const dim = zoneColours(
		{ dynamics: 'energy', hue: 'spectral' },
		{ balance: 0.75, dynamics: 0.5 },
		palette,
	);
	const hit = zoneColours(
		{ dynamics: 'onsets', hue: 'spectral' },
		{ balance: 0.75, dynamics: 0.5 },
		palette,
	);

	expect(dim.base.hue).toBe(hue.hue);
	expect(dim.base.chroma).toBe(hue.chroma);
	expect(dim.base.lightness).toBeCloseTo(hue.lightness * 0.775, 9);
	expect(dim.peaks.lightness).toBeCloseTo(towardSurface(hue.lightness * 0.775), 9);
	expect(hit.base.lightness).toBeCloseTo(hue.lightness * 0.88, 9);
	expect(hit.peaks.lightness).toBeCloseTo(towardSurface(hue.lightness * 0.68), 9);
});

test('spectral picks a stepped hue, and lightness stays inside 0..1', () => {
	const spectral = zoneColours(
		{ hue: 'spectral' },
		{ balance: 0.4, dynamics: 0 },
		{ ...palette, steps: 2 },
	);
	const bright = zoneColours(
		{ dynamics: 'onsets', hue: 'spectral' },
		{ balance: 1, dynamics: 1 },
		{ ...palette, stops: [colour(0.98, 0.05, 90)] },
	);

	expect(spectral.base).toEqual(palette.stops[0]);
	expect(bright.base.lightness).toBe(1);
});

test('the table looks up the colour each cell would compute, indexed by the readings that cell uses', () => {
	const paired: TintCell = { dynamics: 'energy', hue: 'spectral' };
	const reading = { balance: 21 / 63, dynamics: 42 / 63 };
	const pairedTable = tintTable(paired, palette);
	const pairedColours = zoneColours(paired, reading, palette);

	expect(rgbAt(pairedTable.base, pairedTable.indexOf(reading))).toEqual([
		...rgbOf(pairedColours.base),
	]);
	expect(rgbAt(pairedTable.peaks, pairedTable.indexOf(reading))).toEqual([
		...rgbOf(pairedColours.peaks),
	]);

	const energy = tintTable({ dynamics: 'energy' }, palette);
	const spectral = tintTable({ hue: 'spectral' }, palette);

	expect(energy.indexOf({ balance: 1, dynamics: 0.2 })).toBe(51);
	expect(spectral.indexOf({ balance: 0.2, dynamics: 1 })).toBe(51);
	expect(energy.indexOf({ balance: 0, dynamics: 7 })).toBe(255);
});
