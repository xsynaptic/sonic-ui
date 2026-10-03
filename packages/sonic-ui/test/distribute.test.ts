import { expect, test } from 'vitest';

import type { SumMember, SumMode } from '#lib/distribute.ts';

import { distribute, sumLimits } from '#lib/distribute.ts';
import { clamp } from '#lib/math.ts';

interface MemberSpec {
	isFree?: boolean;
	max?: number;
	min?: number;
	step?: number;
}

function member(
	value: number,
	{ isFree = true, max = 100, min = 0, step = 1 }: MemberSpec = {},
): SumMember {
	const snap = (next: number): number =>
		clamp(min + Math.round((next - min) / step) * step, min, max);

	return {
		isFree,
		max,
		min,
		snap,
		stepFrom: (from, direction) => snap(from + direction * step),
		value,
	};
}

function members(values: Array<number>, spec: MemberSpec = {}): Array<SumMember> {
	return values.map((value) => member(value, spec));
}

const sum = (values: Array<number>): number => values.reduce((total, value) => total + value, 0);

test.each([
	['proportional', 70, [70, 18, 12]],
	['equal', 95, [95, 5, 0]],
	['cascade', 90, [90, 0, 10]],
] as const)('%s, the first of [50, 30, 20] to %d', (mode, target, expected) => {
	const result = distribute(
		members([50, 30, 20]),
		{ mode: mode, total: 100 },
		{ index: 0, target: target },
	);

	expect(result).toEqual(expected);
	expect(sum(result)).toBe(100);
});

test('a rounding remainder steps the last free member', () => {
	const result = distribute(
		members([34, 33, 33]),
		{ mode: 'proportional', total: 100 },
		{ index: 0, target: 35 },
	);

	expect(result).toEqual([35, 33, 32]);
});

test('shares snap to a step of 5', () => {
	const result = distribute(
		members([50, 30, 20], { step: 5 }),
		{ mode: 'proportional', total: 100 },
		{ index: 0, target: 65 },
	);

	expect(result).toEqual([65, 20, 15]);
});

test('proportional weights count from each minimum', () => {
	const result = distribute(
		members([40, 35, 25], { min: 10 }),
		{ mode: 'proportional', total: 100 },
		{ index: 0, target: 60 },
	);

	expect(result[0]).toBe(60);
	expect(sum(result)).toBe(100);
	expect(Math.min(...result)).toBeGreaterThanOrEqual(10);
	expect(result).toEqual([60, 23, 17]);
});

test('proportional splits evenly between members that hold nothing', () => {
	const result = distribute(
		members([100, 0, 0]),
		{ mode: 'proportional', total: 100 },
		{ index: 0, target: 80 },
	);

	expect(result).toEqual([80, 10, 10]);
});

test.each(['proportional', 'equal', 'cascade'] as const)(
	'%s keeps a locked member and stops the mover at what the rest can give',
	(mode: SumMode) => {
		const snapshot = [member(50), member(30, { isFree: false }), member(20)];

		expect(distribute(snapshot, { mode: mode, total: 100 }, { index: 0, target: 90 })).toEqual([
			70, 30, 0,
		]);
	},
);

test('the limits leave out a locked member, and count every minimum', () => {
	expect(sumLimits([member(50), member(30, { isFree: false }), member(20)], 0, 100)).toEqual([
		0, 70,
	]);
	expect(sumLimits(members([50, 30, 20], { min: 10 }), 0, 100)).toEqual([10, 80]);
});

test('a locked mover changes nothing', () => {
	const snapshot = [member(50, { isFree: false }), member(30), member(20)];

	expect(
		distribute(snapshot, { mode: 'proportional', total: 100 }, { index: 0, target: 80 }),
	).toEqual([50, 30, 20]);
});

test('cascade from the last member wraps to the first', () => {
	expect(
		distribute(members([50, 30, 20]), { mode: 'cascade', total: 100 }, { index: 2, target: 40 }),
	).toEqual([30, 30, 40]);
});

test('a falling mover gives to the rest by their height, and a member at its max hands on the rest', () => {
	expect(
		distribute(
			members([50, 30, 20]),
			{ mode: 'proportional', total: 100 },
			{ index: 0, target: 20 },
		),
	).toEqual([20, 48, 32]);

	const capped = [member(50), member(30), member(20, { max: 25 })];

	expect(
		distribute(capped, { mode: 'proportional', total: 100 }, { index: 0, target: 20 }),
	).toEqual([20, 55, 25]);
});

test('a move by nobody spreads the gap to the total over every free member', () => {
	expect(distribute(members([20, 20, 20]), { mode: 'equal', total: 90 })).toEqual([30, 30, 30]);
});
