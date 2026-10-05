import { expect, test } from 'vitest';

import { listTaper, logTaper, skewTaper } from '#lib/taper.ts';

test('a 20 Hz to 20 kHz skew through 1 kHz puts 68 Hz and 5.7 kHz at the quarters', () => {
	const taper = skewTaper(20, 20_000, 1000);

	expect(taper?.proportionOf(1000)).toBeCloseTo(0.5, 12);
	expect(taper?.valueAt(0.25)).toBeCloseTo(68, 0);
	expect(taper?.valueAt(0.75)).toBeCloseTo(5700, -2);
});

test('a 20 Hz to 20 kHz log taper puts 632 Hz at the middle', () => {
	expect(logTaper(20, 20_000)?.valueAt(0.5)).toBeCloseTo(632, 0);
});

test.each([
	['skew', skewTaper(0, 2, 0.1)],
	['log', logTaper(20, 20_000)],
])('a %s taper round-trips across the range', (_case, taper) => {
	for (let proportion = 0; proportion <= 1; proportion += 0.125) {
		expect(taper?.proportionOf(taper.valueAt(proportion))).toBeCloseTo(proportion, 12);
	}
});

test.each([
	['at min', 0],
	['at max', 100],
	['outside the range', 150],
	['at the center', 50],
	['missing', NaN],
])('a midpoint %s takes no skew', (_case, midpoint) => {
	expect(skewTaper(0, 100, midpoint)).toBeUndefined();
});

test.each([
	[0, 100],
	[-10, 100],
	[50, 50],
])('a log taper from %d to %d is impossible', (min, max) => {
	expect(logTaper(min, max)).toBeUndefined();
});

test('a log taper clamps a value or a proportion outside its range', () => {
	const taper = logTaper(1, 10);

	expect(taper?.proportionOf(-1)).toBe(0);
	expect(taper?.proportionOf(15)).toBe(1);
	expect(taper?.valueAt(-0.1)).toBe(1);
});

test('a 1 to 2 log taper puts 1.5 at 0.585 of the travel', () => {
	expect(logTaper(1, 2)?.proportionOf(1.5)).toBeCloseTo(0.5849625, 6);
});

test('a skew from a min above zero keeps its ends exact and clamps past them', () => {
	const taper = skewTaper(20, 20_000, 1000);

	expect(taper?.valueAt(0)).toBe(20);
	expect(taper?.valueAt(1)).toBe(20_000);
	expect(taper?.proportionOf(10)).toBe(0);
	expect(taper?.proportionOf(30_000)).toBe(1);
});

test.each([
	[-20, 0],
	[-5, 0.25],
	[50, 0.75],
	[75, 0.875],
	[150, 1],
])('a list taper over -10, 0 and 100 maps %d to %d', (value, proportion) => {
	expect(listTaper([-10, 0, 100]).proportionOf(value)).toBe(proportion);
});

test.each([
	[1, 10],
	[20, 20_000],
	[0.3, 7],
])('a log taper from %d to %d returns its bounds exactly at the ends', (min, max) => {
	const taper = logTaper(min, max);

	expect(taper?.valueAt(0)).toBe(min);
	expect(taper?.valueAt(1)).toBe(max);
});

test('a list taper has no proportion for a value that is not a number', () => {
	expect(listTaper([1, 2, 4]).proportionOf(NaN)).toBeNaN();
});
