import { expect, test } from 'vitest';

import { resamplePeaks } from '#lib/resample-peaks.ts';

function rounded(peaks: ArrayLike<number>): Array<number> {
	return Array.from(peaks, (peak) => Math.round(peak * 1000) / 1000);
}

// Eight values over three bars average to 0.3, 0.8 and 1, where a max would give 0.4, 1 and 1
test('downsampling takes the mean of the values each bar covers', () => {
	expect(rounded(resamplePeaks([0.2, 0.4, 0.6, 0.8, 1, 1, 1, 1], 3))).toEqual([0.3, 0.8, 1]);
});

test('the tallest bar stands as tall as the loudest peak, and the rest keep their proportion', () => {
	expect(rounded(resamplePeaks([0.1, 0.2, 0.8, 0.2, 0.4, 0.2, 0.3], 3))).toEqual([0.24, 0.8, 0.48]);
});

test('the same peaks reach the same height at every bar count below their own', () => {
	const peaks = [0.1, 0.2, 0.8, 0.2, 0.4, 0.2, 0.3];

	for (const count of [2, 3, 4, 5, 6, 7]) {
		expect(Math.max(...resamplePeaks(peaks, count))).toBeCloseTo(0.8, 9);
	}
});

test('a quiet source stays quiet at every bar count', () => {
	expect(rounded(resamplePeaks([0.1, 0.2, 0.1], 2))).toEqual([0.133, 0.2]);
	expect(rounded(resamplePeaks([0.1, 0.2, 0.1], 3))).toEqual([0.1, 0.2, 0.1]);
	expect(rounded(resamplePeaks([0.1, 0.2, 0.1], 4))).toEqual([0.1, 0.167, 0.167, 0.1]);
});

test('silence stays silent', () => {
	expect(resamplePeaks([0, 0, 0, 0, 0], 2)).toEqual([0, 0]);
});

test('upsampling interpolates between the values', () => {
	expect(rounded(resamplePeaks([0, 0.4, 0.8], 7))).toEqual([
		0, 0.133, 0.267, 0.4, 0.533, 0.667, 0.8,
	]);
});

test('nothing to draw gives no bars', () => {
	expect(resamplePeaks([], 10)).toEqual([]);
	expect(resamplePeaks([0.5], 0)).toEqual([]);
});

test.each([NaN, Infinity, -Infinity])('a peak of %d draws as silence at every ratio', (bad) => {
	expect(rounded(resamplePeaks([0.2, bad, 0.6, 0.4], 2))).toEqual([0.12, 0.6]);
	expect(resamplePeaks([0.2, bad, 0.6], 3)).toEqual([0.2, 0, 0.6]);
	expect(rounded(resamplePeaks([0.2, bad, 0.6], 5))).toEqual([0.2, 0.1, 0, 0.3, 0.6]);
});

test('one value spreads flat across every bar', () => {
	expect(resamplePeaks([0.4], 3)).toEqual([0.4, 0.4, 0.4]);
});
