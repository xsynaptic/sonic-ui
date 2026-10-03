import { describe, expect, test } from 'vitest';

import { scaleOf } from './helpers.ts';

test.each([
	['ArrowRight', 52],
	['ArrowLeft', 48],
	['Home', 10],
	['End', 110],
	['Tab', undefined],
])('%s from 50, stepping by 2 from 10, targets %s', (key, expected) => {
	expect(scaleOf({ max: 110, min: 10, step: 2 }).keyTarget(key, 50)).toBe(expected);
});

test.each([
	['ArrowUp', 1.25],
	['ArrowDown', 0.75],
	['PageUp', 3.5],
	['PageDown', -1.5],
])('%s from 1, stepping by 0.25 from -5, targets %s', (key, expected) => {
	expect(scaleOf({ max: 5, min: -5, step: 0.25 }).keyTarget(key, 1)).toBe(expected);
});

test('steps count from min, as on a range input, and End lands on the last step', () => {
	const scale = scaleOf({ max: 20, min: 3, step: 5 });

	expect(scale.snap(9)).toBe(8);
	expect(scale.keyTarget('ArrowUp', 8)).toBe(13);
	expect(scale.keyTarget('End', 8)).toBe(18);
});

test.each([
	['ArrowUp', 105],
	['ArrowDown', 95],
	['PageUp', 150],
	['PageDown', 50],
])('a key step of 5 over a continuous value takes %s from 100 to %d', (key, expected) => {
	expect(scaleOf({ max: 200, min: 3, step: 0 }).keyTarget(key, 100, 5)).toBe(expected);
});

test('a key step still lands on a step counted from min', () => {
	expect(scaleOf({ max: 20, min: 1, step: 2 }).keyTarget('ArrowUp', 3, 5)).toBe(9);
});

test.each([
	[-0.3, 3, 0],
	[-1.2, 12, 0],
	[-2.4, 23, -0.1],
])('from min %s, %i arrow steps of 0.1 land exactly on %s', (min, presses, expected) => {
	const scale = scaleOf({ max: 3, min, step: 0.1 });
	let value = min;

	for (let press = 0; press < presses; press += 1) value = scale.keyTarget('ArrowUp', value) ?? NaN;

	expect(value).toBe(expected);
});

test('an unstepped range steps its keys by a hundredth of the range', () => {
	const scale = scaleOf({ max: 1.2, min: 0.2, step: 0 });

	expect(scale.keyTarget('ArrowUp', 0.5)).toBe(0.51);
	expect(scale.keyTarget('PageDown', 0.51)).toBe(0.41);
});

test('a Page key that would step across the detent lands on it, and the next moves on', () => {
	const scale = scaleOf({ detent: 3, max: 16, min: -30, step: 0.5 });

	expect(scale.keyTarget('PageUp', 0)).toBe(3);
	expect(scale.keyTarget('PageUp', 3)).toBe(8);
	expect(scale.keyTarget('PageDown', 7)).toBe(3);
});

test.each([
	[{ isNotched: true, max: 7 }, 8],
	[{ isNotched: true, max: 1 }, 2],
	[{ isNotched: true, max: 3, min: -3 }, 7],
	[{ isNotched: true, max: 1, step: 0.25 }, 5],
	[{ isNotched: true, isWrapping: true, max: 370, min: 10, step: 7.5 }, 48],
	[{ isNotched: true, step: 0 }, undefined],
	[{ isNotched: true, max: 0 }, undefined],
	[{ max: 7 }, undefined],
])('%o has %s positions', (spec, expected) => {
	expect(scaleOf(spec).positions).toBe(expected);
});

describe('an endless scale from 10 to 370 in steps of 7.5', () => {
	const endless = scaleOf({ isWrapping: true, max: 370, min: 10, step: 7.5 });

	test.each([
		['ArrowUp', 362.5, 10],
		['ArrowDown', 10, 362.5],
		['PageUp', 325, 40],
		['End', 100, 362.5],
		['Home', 100, 10],
	])('%s from %s targets %s', (key, from, expected) => {
		expect(endless.keyTarget(key, from)).toBe(expected);
	});

	test.each([
		[400, 40],
		[368, 10],
		[-5, 355],
	])('%s wraps to %s', (value, expected) => {
		expect(endless.snap(value)).toBe(expected);
	});

	test('max sits on min, and the taper is ignored', () => {
		const logged = scaleOf({ isWrapping: true, max: 370, min: 10, taper: 'log' });

		expect(logged.place(370)).toBe(0);
		expect(logged.place(190)).toBe(0.5);
	});
});

test('an endless scale with a step far below its range still lands on the step', () => {
	expect(scaleOf({ isWrapping: true, max: 0.9, min: -0.1, step: 0.0000001 }).snap(-0.0000005)).toBe(
		-5e-7,
	);
});

describe('a value list', () => {
	const entries = [0.25, 0.5, 1, 2, 4];
	const listed = scaleOf({ entries });

	test('a value snaps to the nearest entry, and the ends bound the range', () => {
		expect(listed.snap(2.9)).toBe(2);
		expect(listed.snap(3.1)).toBe(4);
		expect(listed.bounds).toEqual([0.25, 4]);
	});

	test.each([
		['ArrowUp', 1, 2],
		['ArrowDown', 1, 0.5],
		['PageUp', 1, 4],
		['PageDown', 2, 0.25],
		['Home', 2, 0.25],
		['End', 0.5, 4],
		['ArrowUp', 4, 4],
	])('%s from %f targets %f, one entry per step', (key, from, expected) => {
		expect(listed.keyTarget(key, from)).toBe(expected);
	});

	test('notched, each entry is a position, and a value between entries sits between their places', () => {
		const notched = scaleOf({ entries, isNotched: true });

		expect(notched.positions).toBe(5);
		expect(notched.place(1.5)).toBe(0.625);
		expect(notched.place(1)).toBe(0.5);
	});

	test('entries past max still place by entry', () => {
		const high = scaleOf({ entries: [100, 200, 400] });

		expect([200, 400].map((value) => high.place(value))).toEqual([0.5, 1]);
	});
});

describe('a taper', () => {
	test('a midpoint sits at half the travel, both ways', () => {
		const skewed = scaleOf({ max: 20_000, midpoint: 1000, min: 20 });

		expect(skewed.place(1000)).toBeCloseTo(0.5, 9);
		expect(skewed.snap(skewed.valueAt(0.5))).toBe(1000);
	});

	test.each([
		['an invalid midpoint', { midpoint: 200 }, 0.3],
		['a notched scale', { isNotched: true, midpoint: 10 }, 0.3],
		['a log taper reaching zero', { taper: 'log' }, 0.3],
		['a log taper reaching zero, with a midpoint', { midpoint: 25, taper: 'log' }, Math.sqrt(0.3)],
	] as const)('%s falls back as it should', (_case, spec, expected) => {
		expect(scaleOf(spec).place(30)).toBeCloseTo(expected, 9);
	});

	test('log wins over a midpoint where the range allows it', () => {
		expect(scaleOf({ max: 10_000, midpoint: 5000, min: 1, taper: 'log' }).place(100)).toBeCloseTo(
			0.5,
			9,
		);
	});

	test.each([
		['ArrowUp', 25, 26],
		['ArrowDown', 25, 24],
		['PageUp', 25, 36],
		['PageDown', 25, 16],
		['ArrowUp', 0, 1],
		['Home', 25, 0],
		['End', 25, 100],
	])('%s from %d on a midpoint of 25 targets %d', (key, from, expected) => {
		expect(scaleOf({ midpoint: 25 }).keyTarget(key, from)).toBe(expected);
	});

	test.each([
		['ArrowUp', 0.5],
		['ArrowDown', 0],
	])('%s stepping by 0.25 moves at least one step, to %s', (key, expected) => {
		expect(scaleOf({ midpoint: 25, step: 0.25 }).keyTarget(key, 0.25)).toBe(expected);
	});

	test('keys on a log taper move by the travel, snapped to the step', () => {
		const logged = scaleOf({ max: 10_000, min: 1, taper: 'log' });

		expect(logged.keyTarget('PageUp', 100)).toBe(251);
		expect(logged.keyTarget('ArrowUp', 100)).toBe(110);
	});

	test('a midpoint at the centre is linear, so each arrow moves one step', () => {
		expect(scaleOf({ max: 20_000, midpoint: 10_010, min: 20 }).keyTarget('ArrowUp', 1000)).toBe(
			1001,
		);
	});
});

test('place clamps to the range', () => {
	const bounded = scaleOf({ max: 6, min: -60 });

	expect([-60, -27, -80, 6].map((value) => bounded.place(value))).toEqual([0, 0.5, 0, 1]);
});

test.each([
	[{ max: 100, min: -0.5, step: 3 }, 2, 2.5],
	[{ max: 100, min: -2.5, step: 3 }, -6.2, -2.5],
	[{ max: 100, min: -100, step: 5 }, -8, -10],
	[{ max: 100, min: -100, step: 5 }, -6, -5],
	[{ max: 100, min: -100, step: 5 }, 2, 0],
	[{ max: 15, min: 1, step: 2.5 }, 2.5, 3.5],
	[{ max: 15, min: 1, step: 2.5 }, 6.5, 6],
	[{ max: 15, min: 1, step: 2.5 }, 13, 13.5],
	[{ max: 1, min: 0.05, step: 0.1 }, 0.3, 0.35],
	[{ max: 0, min: 10 }, 5, 10],
])('on %o, %d snaps to %d', (spec, value, expected) => {
	expect(scaleOf(spec).snap(value)).toBe(expected);
});

test('two arrows on a step of 1e-7 land on 2e-7', () => {
	const scale = scaleOf({ max: 1, step: 1e-7 });

	expect(scale.keyTarget('ArrowRight', scale.keyTarget('ArrowRight', 0) ?? NaN)).toBe(2e-7);
});

test.each([10, 0])('an endless scale from 10 to %d holds min', (max) => {
	const collapsed = scaleOf({ isWrapping: true, max, min: 10 });

	expect(collapsed.snap(5)).toBe(10);
	expect(collapsed.keyTarget('End', 5)).toBe(10);
	expect(collapsed.keyTarget('ArrowUp', 10)).toBe(10);
});

test('an endless scale wraps a value a float short of max to min', () => {
	expect(scaleOf({ isWrapping: true, max: 370, min: 10, step: 0 }).snap(370 - 1e-13)).toBe(10);
});

test.each([
	[{ max: 10, step: 3 }, 12, 9],
	[{ max: 15, min: 1, step: 2.5 }, 15, 13.5],
	[{ max: 10, step: 25 }, 240, 0],
	[{ max: 0.55, min: -0.3, step: 0.1 }, 0.55, 0.5],
])('on %o, the top is the last step, so %d snaps to %d', (spec, value, expected) => {
	const scale = scaleOf(spec);

	expect(scale.snap(value)).toBe(expected);
	expect(scale.bounds[1]).toBe(expected);
	expect(scale.keyTarget('End', scale.bounds[0])).toBe(expected);
});

test.each([
	[{ max: 10, step: 3 }, [12, 10, 9.6, -4]],
	[{ max: 15, min: 1, step: 2.5 }, [15, 14.9, 14.2]],
	[{ isWrapping: true, max: 360, step: 7 }, [365, 359, 358.4, 353.6, -3]],
	[{ isWrapping: true, max: 370, min: 10, step: 7.5 }, [368, 366.2, 400]],
])('on %o, a snapped value snaps to itself', (spec, values) => {
	const scale = scaleOf(spec);

	for (const value of values) expect(scale.snap(scale.snap(value))).toBe(scale.snap(value));
});

describe('an endless scale whose step of 7 does not divide its 360', () => {
	const uneven = scaleOf({ isWrapping: true, max: 360, step: 7 });

	test.each([
		['ArrowUp', 357, 0],
		['ArrowDown', 0, 357],
		['ArrowUp', 350, 357],
		['PageUp', 322, 28],
		['End', 14, 357],
	])('%s from %d targets %d, through a short seam', (key, from, expected) => {
		expect(uneven.keyTarget(key, from)).toBe(expected);
	});

	test.each([
		[365, 7],
		[358.4, 357],
		[359, 0],
		[-2, 357],
	])('%d snaps to %d, the nearer of the last step and min past it', (value, expected) => {
		expect(uneven.snap(value)).toBe(expected);
	});
});

test('End on an endless scale lands on the last step despite float residue in its range', () => {
	expect(scaleOf({ isWrapping: true, max: -6.1, min: -7, step: 0.1 }).keyTarget('End', -7)).toBe(
		-6.2,
	);
});
