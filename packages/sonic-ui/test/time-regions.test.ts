import { expect, test } from 'vitest';

import { dueRegions } from '#lib/time-regions.ts';

const regions: Array<[number, number]> = [
	[10, 20],
	[40, 45],
];

const listedMs = new Map([
	['10:20', 1000],
	['40:45', 1300],
]);

test('a pending region is due once it has been listed for the delay', () => {
	expect(dueRegions(regions, listedMs, [1399, 400])).toEqual([]);
	expect(dueRegions(regions, listedMs, [1400, 400])).toEqual([[10, 20]]);
	expect(dueRegions(regions, listedMs, [1700, 400])).toEqual(regions);
});

test('with no delay every region is due, listed or not', () => {
	expect(dueRegions(regions, new Map(), [0, 0])).toEqual(regions);
});
