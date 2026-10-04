import { expect, test } from 'vitest';

import { markerLanes, nearestDot } from '#lib/marker-band.ts';

test('a marker closer than the minimum to the last in every lane opens a new one', () => {
	expect(markerLanes([10, 12, 14], 5)).toEqual([0, 1, 2]);
});

test('a marker takes the first lane that has room, not the newest', () => {
	expect(markerLanes([10, 12, 15, 17, 40], 5)).toEqual([0, 1, 0, 1, 0]);
});

test('a marker exactly the minimum away shares the lane', () => {
	expect(markerLanes([10, 15], 5)).toEqual([0, 0]);
});

test('the nearer of two dots within reach wins, whichever comes first', () => {
	const point = { x: 50, y: 2 };

	expect(
		nearestDot(
			point,
			[
				{ x: 47, y: 2 },
				{ x: 51, y: 2 },
			],
			5,
		),
	).toBe(1);
	expect(
		nearestDot(
			point,
			[
				{ x: 51, y: 2 },
				{ x: 47, y: 2 },
			],
			5,
		),
	).toBe(0);
});

test("a press in a dot's column but below its reach finds nothing", () => {
	expect(nearestDot({ x: 50, y: 20 }, [{ x: 50, y: 2 }], 5)).toBeUndefined();
});

test('of two dots in one column, the lane under the press wins', () => {
	const dots = [
		{ x: 50, y: 2 },
		{ x: 51, y: 7 },
	];

	expect(nearestDot({ x: 50, y: 6 }, dots, 5)).toBe(1);
	expect(nearestDot({ x: 50, y: 3 }, dots, 5)).toBe(0);
});

test('reach is measured across both axes at once', () => {
	expect(nearestDot({ x: 53, y: 6 }, [{ x: 50, y: 2 }], 5)).toBe(0);
	expect(nearestDot({ x: 54, y: 6 }, [{ x: 50, y: 2 }], 5)).toBeUndefined();
});
