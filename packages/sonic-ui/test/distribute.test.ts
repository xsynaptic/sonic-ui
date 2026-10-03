import { expect, test } from 'vitest';

import type { SumMember, SumMode } from '#lib/distribute.ts';

import { distribute, sumLimits } from '#lib/distribute.ts';
import { clamp } from '#lib/math.ts';

import { scaleOf } from './helpers.ts';

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

test.each(['equal', 'proportional'] as const)(
	'%s hands a remainder of two steps to two members, one step each',
	(mode) => {
		expect(
			distribute(
				members([50, 10, 10, 10, 10, 10]),
				{ mode: mode, total: 100 },
				{ index: 0, target: 48 },
			),
		).toEqual([48, 10, 10, 10, 11, 11]);
	},
);

test('a remainder goes to the member rounded furthest from its share, not the last', () => {
	expect(
		distribute(
			members([50, 9, 26, 15]),
			{ mode: 'proportional', total: 100 },
			{ index: 0, target: 47 },
		),
	).toEqual([47, 9, 28, 16]);
});

test('a mover on a finer step is held back to what the coarser siblings can absorb', () => {
	const snapshot = [member(50), member(25, { step: 5 }), member(25, { step: 5 })];

	expect(
		distribute(snapshot, { mode: 'proportional', total: 100 }, { index: 0, target: 51 }),
	).toEqual([50, 25, 25]);
	expect(distribute(snapshot, { mode: 'cascade', total: 100 }, { index: 0, target: 53 })).toEqual([
		55, 20, 25,
	]);
});

test('a held-back mover lands on the nearest value its siblings can absorb, either side of the target', () => {
	const snapshot = [member(50), member(25, { step: 5 }), member(25, { step: 5 })];
	const rule = { mode: 'proportional', total: 100 } as const;

	expect(distribute(snapshot, rule, { index: 0, target: 56 })).toEqual([55, 25, 20]);
	expect(distribute(snapshot, rule, { index: 0, target: 58 })).toEqual([60, 20, 20]);
	expect(distribute(snapshot, rule, { index: 0, target: 47 })).toEqual([45, 30, 25]);
});

test('a move with a direction never lands back where it started while a value that way can be reached', () => {
	const snapshot = [member(50), member(25, { step: 5 }), member(25, { step: 5 })];
	const rule = { mode: 'proportional', total: 100 } as const;

	expect(distribute(snapshot, rule, { direction: 1, index: 0, target: 51 })).toEqual([55, 25, 20]);
	expect(distribute(snapshot, rule, { direction: -1, index: 0, target: 49 })).toEqual([45, 30, 25]);

	const full = [member(50), member(25, { max: 25, step: 5 }), member(25, { max: 25, step: 5 })];

	expect(distribute(full, rule, { direction: -1, index: 0, target: 49 })).toEqual([50, 25, 25]);
});

test('a sibling whose next step lies past its bound is not stepped there, nor counted as able to step', () => {
	const pinned: SumMember = {
		...member(10, { max: 10, min: 10 }),
		stepFrom: (from, direction) => from + direction,
	};
	const snapshot = [member(70), pinned, member(20, { step: 5 })];
	const rule = { mode: 'proportional', total: 100 } as const;

	expect(distribute(snapshot, rule, { index: 0, target: 68 })).toEqual([70, 10, 20]);
	expect(distribute(snapshot, rule, { direction: -1, index: 0, target: 69 })).toEqual([65, 10, 25]);
});

test('a total past what the bounds allow saturates at the bounds', () => {
	expect(distribute(members([10, 10], { max: 20 }), { mode: 'equal', total: 100 })).toEqual([
		20, 20,
	]);
	expect(distribute(members([30, 30], { min: 25 }), { mode: 'proportional', total: 10 })).toEqual([
		25, 25,
	]);
});

test('a lone member cannot move, and its limits pin it where it is', () => {
	expect(distribute([member(40)], { mode: 'equal', total: 40 }, { index: 0, target: 70 })).toEqual([
		40,
	]);
	expect(sumLimits([member(40)], 0, 40)).toEqual([40, 40]);
});

test('a mover with only locked siblings is pinned to its value', () => {
	const snapshot = [member(50), member(30, { isFree: false }), member(20, { isFree: false })];

	expect(sumLimits(snapshot, 0, 100)).toEqual([50, 50]);
	expect(distribute(snapshot, { mode: 'equal', total: 100 }, { index: 0, target: 10 })).toEqual([
		50, 30, 20,
	]);
});

test.each([NaN, Infinity, -Infinity])('a target of %d changes nothing', (target) => {
	expect(
		distribute(members([50, 30, 20]), { mode: 'proportional', total: 100 }, { index: 0, target }),
	).toEqual([50, 30, 20]);
});

test('fractional steps settle a remainder without float residue', () => {
	const scale = scaleOf({ max: 1, step: 0.1 });
	const snapshot = [0.4, 0.3, 0.3].map((value): SumMember => ({
		isFree: true,
		max: 1,
		min: 0,
		snap: scale.snap,
		stepFrom: (from, direction) =>
			scale.keyTarget(direction > 0 ? 'ArrowRight' : 'ArrowLeft', from) ?? from,
		value,
	}));

	expect(distribute(snapshot, { mode: 'equal', total: 1 }, { index: 0, target: 0.5 })).toEqual([
		0.5, 0.3, 0.2,
	]);
});

test('cascade: a neighbour at its min hands the rest on', () => {
	const snapshot = [member(40), member(15, { min: 10 }), member(25), member(20)];

	expect(distribute(snapshot, { mode: 'cascade', total: 100 }, { index: 0, target: 52 })).toEqual([
		52, 10, 18, 20,
	]);
});

test('cascade: a neighbour at its max hands the rest on', () => {
	const snapshot = [member(40), member(15, { max: 22 }), member(25), member(20)];

	expect(distribute(snapshot, { mode: 'cascade', total: 100 }, { index: 0, target: 28 })).toEqual([
		28, 22, 30, 20,
	]);
});

test('cascade: the walk wraps past the end and stops short of the mover', () => {
	const snapshot = [member(4), member(6), member(50), member(8), member(32)];

	expect(distribute(snapshot, { mode: 'cascade', total: 100 }, { index: 2, target: 95 })).toEqual([
		0, 5, 95, 0, 0,
	]);
});

test('cascade: a locked member is skipped and the next one gives', () => {
	const snapshot = [member(40), member(15, { isFree: false }), member(25), member(20)];

	expect(distribute(snapshot, { mode: 'cascade', total: 100 }, { index: 0, target: 70 })).toEqual([
		70, 15, 0, 15,
	]);
});

function seeded(seed: number): () => number {
	let state = seed;

	return () => {
		state = (state * 48_271) % 2_147_483_647;

		return state / 2_147_483_647;
	};
}

interface Sibling {
	max: number;
	min: number;
	value: number;
}

function filled(siblings: Array<Sibling>, level: number, weights: Array<number>): Array<number> {
	return siblings.map(({ max, min, value }, at) =>
		clamp(value + level * (weights[at] ?? 0), min, max),
	);
}

// The exact clamped shares by bisection on the fill level, where the module caps and re-shares
function exactShares(
	siblings: Array<Sibling>,
	owed: number,
	weights: Array<number>,
): Array<number> {
	const target = sum(siblings.map(({ value }) => value)) + owed;
	let low = 0;
	let high = 1e6;

	for (let pass = 0; pass < 200; pass += 1) {
		const level = (low + high) / 2;
		const isShort =
			owed > 0
				? sum(filled(siblings, level, weights)) < target
				: sum(filled(siblings, -level, weights)) > target;

		if (isShort) low = level;
		else high = level;
	}

	return filled(siblings, Math.sign(owed) * high, weights);
}

function drawCase(random: () => number): {
	mode: 'equal' | 'proportional';
	snapshot: Array<SumMember>;
	step: number;
	target: number;
} {
	const pick = (count: number): number => Math.floor(random() * count);
	const step = [1, 5, 0.25][pick(3)] ?? 1;
	const snapshot = Array.from({ length: 3 + pick(5) }, () => {
		const min = pick(4) * step;
		const max = min + (4 + pick(40)) * step;

		// One step above its min at least, so every proportional weight is positive
		return member(min + (1 + pick((max - min) / step)) * step, { max, min, step });
	});
	const [mover] = snapshot;

	return {
		mode: random() < 0.5 ? 'equal' : 'proportional',
		snapshot,
		step,
		target: mover ? mover.min + pick((mover.max - mover.min) / step + 1) * step : 0,
	};
}

function expectNearShares(
	rest: Array<number>,
	siblings: Array<SumMember>,
	near: { exact: Array<number>; label: string; step: number },
): void {
	for (const [at, value] of rest.entries()) {
		const sibling = siblings[at];
		if (!sibling) throw new Error('No sibling');

		expect(value, near.label).toBeGreaterThanOrEqual(sibling.min);
		expect(value, near.label).toBeLessThanOrEqual(sibling.max);
		expect(Math.abs(value - (near.exact[at] ?? NaN)), near.label).toBeLessThan(near.step);
	}
}

test('on one step grid the total holds, bounds hold, and every sibling lands within a step of its exact share', () => {
	const random = seeded(20_261_003);

	for (let run = 0; run < 500; run += 1) {
		const { mode, snapshot, step, target } = drawCase(random);
		const [mover, ...siblings] = snapshot;
		if (!mover) throw new Error('No mover');

		const total = sum(snapshot.map(({ value }) => value));
		const [moved = NaN, ...rest] = distribute(snapshot, { mode, total }, { index: 0, target });
		const exact = exactShares(
			siblings,
			mover.value - moved,
			siblings.map(({ min, value }) => (mode === 'equal' ? 1 : value - min)),
		);
		const label = `run ${String(run)}: ${mode} step ${String(step)} to ${String(target)}`;

		expect(moved, label).toBe(clamp(target, ...sumLimits(snapshot, 0, total)));
		expect(moved + sum(rest), label).toBe(total);
		expectNearShares(rest, siblings, { exact, label, step });
	}
});
