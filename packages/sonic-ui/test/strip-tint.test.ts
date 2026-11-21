import { expect, test } from 'vitest';

import type { TintPalette } from '#lib/wave-tint.ts';

import { levelTable } from '#lib/band-levels.ts';
import { stripTintReadiness, stripTints } from '#lib/strip-tint.ts';

// A black-to-white palette makes each tint's lightness equal to its palette position
const greyRamp: TintPalette = {
	peaksDepth: 0,
	steps: 0,
	stops: [
		{ chroma: 0, hue: 0, lightness: 0 },
		{ chroma: 0, hue: 0, lightness: 1 },
	],
	surfaceLightness: 0,
};

// Two bands stored as bytes across 48 dB, so a difference of 51 bytes is 9.6 dB
const bands = levelTable({
	bandCount: 2,
	levels: Uint8Array.from([128, 128, 128, 179, 179, 128, 128, 128, 128, 230, 128, 128]),
	medians: [128, 128],
	minDecibels: -48,
});

function lightnesses(tints: Array<{ lightness: number }>): Array<number> {
	return tints.map(({ lightness }) => Math.round(lightness * 1000) / 1000);
}

test('a bar takes the mean balance of the rows it spans, at any ratio of rows to bars', () => {
	const sources = { bands, peaks: undefined, peaksRange: undefined };
	const tints = (count: number): Array<number> =>
		lightnesses(stripTints({ hue: 'spectral' }, sources, [greyRamp, 12, count]));

	expect(tints(6)).toEqual([0.5, 0.9, 0.1, 0.5, 1, 0.5]);
	expect(tints(3)).toEqual([0.7, 0.3, 0.9]);
	expect(tints(4)).toEqual([0.5, 0.5, 0.5, 0.9]);
	expect(tints(12)).toEqual([0.5, 0.5, 0.9, 0.9, 0.1, 0.1, 0.5, 0.5, 1, 1, 0.5, 0.5]);
});

test('rms reads the mean slice of a bar against the range, and onsets are dropped', () => {
	const peaks = [0.1, 0.1, 0.2, 0.2, 0.4, 0.8];
	const sources = { bands: undefined, peaks, peaksRange: [0.1, 0.4] as const };
	const readiness = stripTintReadiness({ dynamics: 'onsets' }, sources);

	expect(lightnesses(stripTints({ dynamics: 'energy' }, sources, [greyRamp, 12, 3]))).toEqual([
		0, 0.5, 1,
	]);
	expect(readiness).toEqual({ isReady: false, missing: undefined });
	expect(
		stripTintReadiness({ dynamics: 'onsets', hue: 'spectral' }, { ...sources, bands }),
	).toEqual({
		cell: { hue: 'spectral' },
		isReady: true,
	});
});

test('a strip tint missing its reference names it, and one with no data names nothing', () => {
	const bare = levelTable({ bandCount: 2, levels: new Uint8Array(4) });
	const peaks = [0.5];

	expect(
		stripTintReadiness({ hue: 'spectral' }, { bands: bare, peaks, peaksRange: undefined }),
	).toEqual({
		isReady: false,
		missing: 'bands.medians',
	});
	expect(
		stripTintReadiness({ dynamics: 'energy' }, { bands, peaks, peaksRange: [0.4, 0.2] }),
	).toEqual({
		isReady: false,
		missing: 'peaksRange',
	});
	expect(
		stripTintReadiness({ dynamics: 'energy' }, { bands, peaks: [], peaksRange: undefined }),
	).toEqual({
		isReady: false,
		missing: undefined,
	});
	expect(
		stripTintReadiness({ hue: 'spectral' }, { bands: undefined, peaks, peaksRange: undefined }),
	).toEqual({
		isReady: false,
		missing: undefined,
	});
});

test('each reading needs only its own data, and empty data or an empty palette draws nothing', () => {
	const peaks = [0.2, 0.4];
	const peaksRange = [0.1, 0.4] as const;
	const empty = levelTable({ bandCount: 2, levels: new Uint8Array(1), medians: [1, 1] });

	expect(
		stripTintReadiness({ dynamics: 'energy' }, { bands: undefined, peaks, peaksRange }),
	).toEqual({
		cell: { dynamics: 'energy' },
		isReady: true,
	});
	expect(
		stripTintReadiness({ hue: 'spectral' }, { bands, peaks: undefined, peaksRange: undefined }),
	).toEqual({
		cell: { hue: 'spectral' },
		isReady: true,
	});
	expect(stripTintReadiness({ hue: 'spectral' }, { bands: empty, peaks, peaksRange })).toEqual({
		isReady: false,
		missing: undefined,
	});
	expect(stripTintReadiness({ dynamics: 'energy' }, { bands, peaks: [], peaksRange })).toEqual({
		isReady: false,
		missing: undefined,
	});
	expect(
		stripTints({ dynamics: 'energy' }, { bands, peaks, peaksRange }, [
			{ ...greyRamp, stops: [] },
			12,
			2,
		]),
	).toEqual([]);
});
