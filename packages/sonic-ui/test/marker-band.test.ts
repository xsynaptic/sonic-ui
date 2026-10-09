import { expect, test } from 'vitest';

import { centersInReach, markerLanes } from '#lib/marker-band.ts';

test('a marker closer than the minimum to the last in every lane opens a new one', () => {
	expect(markerLanes([10, 12, 14], 5)).toEqual([0, 1, 2]);
});

test('a marker takes the first lane that has room, not the newest', () => {
	expect(markerLanes([10, 12, 15, 17, 40], 5)).toEqual([0, 1, 0, 1, 0]);
});

test('a marker exactly the minimum away shares the lane', () => {
	expect(markerLanes([10, 15], 5)).toEqual([0, 0]);
});

test('every center in reach comes back nearest first, whichever comes first', () => {
	const point = { x: 50, y: 2 };

	expect(
		centersInReach(
			point,
			[
				{ x: 47, y: 2 },
				{ x: 51, y: 2 },
				{ x: 52, y: 5 },
			],
			5,
		),
	).toEqual([1, 0, 2]);
	expect(
		centersInReach(
			point,
			[
				{ x: 51, y: 2 },
				{ x: 47, y: 2 },
			],
			5,
		),
	).toEqual([0, 1]);
});

test('of centers equally near, the later comes first', () => {
	expect(
		centersInReach(
			{ x: 50, y: 2 },
			[
				{ x: 48, y: 2 },
				{ x: 50, y: 2 },
				{ x: 52, y: 2 },
				{ x: 50, y: 2 },
			],
			5,
		),
	).toEqual([3, 1, 2, 0]);
});

test('a center at the reach is in, and one a pixel past it is left out', () => {
	const centers = [
		{ x: 55, y: 2 },
		{ x: 56, y: 2 },
	];

	expect(centersInReach({ x: 50, y: 2 }, centers, 5)).toEqual([0]);
});

test("a press in a marker's column but below its reach finds nothing", () => {
	expect(centersInReach({ x: 50, y: 20 }, [{ x: 50, y: 2 }], 5)).toEqual([]);
});

test('of two markers in one column, the lane under the press comes first', () => {
	const centers = [
		{ x: 50, y: 2 },
		{ x: 51, y: 7 },
	];

	expect(centersInReach({ x: 50, y: 6 }, centers, 5)).toEqual([1, 0]);
	expect(centersInReach({ x: 50, y: 3 }, centers, 5)).toEqual([0, 1]);
});

test('reach is measured across both axes at once', () => {
	expect(centersInReach({ x: 53, y: 6 }, [{ x: 50, y: 2 }], 5)).toEqual([0]);
	expect(centersInReach({ x: 54, y: 6 }, [{ x: 50, y: 2 }], 5)).toEqual([]);
});
