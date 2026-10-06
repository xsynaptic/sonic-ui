import { expect, test } from 'vitest';

import { positionAt, travelFrom } from '#lib/toggle-travel.ts';

const well = { length: 80, start: 100, thickness: 32 };

test('a grab off-center on the cap keeps its grip, so the crossing comes where the cap is halfway', () => {
	const travel = travelFrom({
		at: 1,
		count: 3,
		first: 0,
		isOnCap: true,
		last: 2,
		pointer: 150,
		well,
	});

	expect(positionAt(travel, 150)).toBe(1);
	expect(Math.round(positionAt(travel, 161))).toBe(1);
	expect(Math.round(positionAt(travel, 163))).toBe(2);
	expect(Math.round(positionAt(travel, 137))).toBe(0);
});

test('a grab beside the cap brings its center under the pointer', () => {
	const travel = travelFrom({
		at: 0,
		count: 3,
		first: 0,
		isOnCap: false,
		last: 2,
		pointer: 160,
		well,
	});

	expect(positionAt(travel, 164)).toBe(2);
	expect(positionAt(travel, 128)).toBe(0.5);
});

test('the cap stops at the ends of the well', () => {
	const travel = travelFrom({
		at: 2,
		count: 3,
		first: 0,
		isOnCap: true,
		last: 2,
		pointer: 170,
		well,
	});

	expect(positionAt(travel, 400)).toBe(2);
	expect(positionAt(travel, -400)).toBe(0);
});

test('a well with one position has no travel', () => {
	const travel = travelFrom({
		at: 0,
		count: 1,
		first: 0,
		isOnCap: true,
		last: 0,
		pointer: 110,
		well,
	});

	expect(positionAt(travel, 300)).toBe(0);
});

test('the cap stops at the outermost enabled positions, wherever it was grabbed', () => {
	const wide = { length: 104, start: 100, thickness: 32 };
	const travel = travelFrom({
		at: 2,
		count: 4,
		first: 1,
		isOnCap: true,
		last: 2,
		pointer: 165,
		well: wide,
	});

	expect(positionAt(travel, -400)).toBe(1);
	expect(positionAt(travel, 400)).toBe(2);
	expect(positionAt(travel, 153)).toBe(1.5);
});
