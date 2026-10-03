import { expect, test } from 'vitest';

import { resamplePeaks } from '#lib/resample-peaks.ts';

function rounded(peaks: ArrayLike<number>): Array<number> {
	return Array.from(peaks, (peak) => Math.round(peak * 1000) / 1000);
}

// Eight values over three bars average to 0.3, 0.8 and 1, where a max would give 0.4, 1 and 1
test('downsampling takes the mean of the values each bar covers', () => {
	expect(rounded(resamplePeaks([0.2, 0.4, 0.6, 0.8, 1, 1, 1, 1], 3))).toEqual([0.3, 0.8, 1]);
});

test('downsampling renormalizes so the loudest bar fills the box', () => {
	expect(rounded(resamplePeaks([0.1, 0.3, 0.1, 0.1], 2))).toEqual([1, 0.5]);
});

test('silence stays silent rather than dividing by zero', () => {
	expect(resamplePeaks([0, 0, 0, 0], 2)).toEqual([0, 0]);
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
	expect(rounded(resamplePeaks([0.2, bad, 0.6, 0.4], 2))).toEqual([0.2, 1]);
	expect(resamplePeaks([0.2, bad, 0.6], 3)).toEqual([0.2, 0, 0.6]);
	expect(rounded(resamplePeaks([0.2, bad, 0.6], 5))).toEqual([0.2, 0.1, 0, 0.3, 0.6]);
});

test('one value spreads flat across every bar', () => {
	expect(resamplePeaks([0.4], 3)).toEqual([0.4, 0.4, 0.4]);
});
