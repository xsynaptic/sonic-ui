import { clamp, trimFloat } from '#lib/math.ts';

export interface SplitMember {
	isFree: boolean;
	max: number;
	min: number;
	snap: (value: number) => number;
	stepFrom: (value: number, direction: -1 | 1) => number;
	value: number;
}

export type SplitMode = 'cascade' | 'equal' | 'proportional';

interface SplitMove {
	direction?: -1 | 0 | 1;
	index: number;
	target: number;
}

interface SplitRule {
	mode: SplitMode;
	total: number;
}

interface Pooled {
	index: number;
	room: number;
	weight: number;
}

const epsilon = 1e-9;

function sumOf(values: ReadonlyArray<number>): number {
	return values.reduce((total, value) => total + value, 0);
}

function others(members: ReadonlyArray<SplitMember>, index: number): Array<SplitMember> {
	return members.filter((_member, at) => at !== index);
}

export function splitLimits(
	members: ReadonlyArray<SplitMember>,
	index: number,
	total: number,
): [number, number] {
	const member = members[index];
	if (!member) return [NaN, NaN];

	const rest = others(members, index);
	const free = rest.filter((other) => other.isFree);
	if (free.length === 0) return [member.value, member.value];

	const fixed = sumOf(rest.filter((other) => !other.isFree).map((other) => other.value));
	const room = total - fixed;

	return [
		Math.max(member.min, room - sumOf(free.map((other) => other.max))),
		Math.min(member.max, room - sumOf(free.map((other) => other.min))),
	];
}

function spreadWeighted(owed: number, pool: ReadonlyArray<Pooled>): Map<number, number> {
	const shares = new Map<number, number>();
	let remaining = owed;
	let active = [...pool];

	while (active.length > 0 && Math.abs(remaining) > epsilon) {
		const weights = sumOf(active.map(({ weight }) => weight));
		const count = active.length;
		const shareOf = (entry: Pooled): number =>
			remaining * (weights > 0 ? entry.weight / weights : 1 / count);
		const full = active.filter((entry) => Math.abs(shareOf(entry)) >= entry.room);

		if (full.length === 0) {
			for (const entry of active) shares.set(entry.index, shareOf(entry));
			break;
		}

		const sign = Math.sign(remaining);

		for (const entry of full) {
			shares.set(entry.index, sign * entry.room);
			remaining -= sign * entry.room;
		}
		active = active.filter((entry) => !full.includes(entry));
	}

	return shares;
}

function spreadInOrder(owed: number, pool: ReadonlyArray<Pooled>): Map<number, number> {
	const shares = new Map<number, number>();
	let remaining = owed;

	for (const entry of pool) {
		if (Math.abs(remaining) <= epsilon) break;

		const share = Math.sign(remaining) * Math.min(entry.room, Math.abs(remaining));

		shares.set(entry.index, share);
		remaining -= share;
	}

	return shares;
}

function poolOrder(members: ReadonlyArray<SplitMember>, index: number): Array<number> {
	const count = members.length;
	const start = index + 1;

	return Array.from({ length: count }, (_entry, offset) => (start + offset) % count).filter(
		(at) => at !== index && members[at]?.isFree === true,
	);
}

function stepWithin(member: SplitMember, from: number, owed: number): number | undefined {
	const next = member.stepFrom(from, owed > 0 ? 1 : -1);
	const change = trimFloat(next - from);
	const isInside = next >= member.min && next <= member.max;

	return change !== 0 && isInside && Math.abs(change) <= Math.abs(owed) + epsilon
		? next
		: undefined;
}

function stepToward(member: SplitMember, from: number, owed: number): number {
	let value = from;
	let remainder = owed;

	while (Math.abs(remainder) > epsilon) {
		const next = stepWithin(member, value, remainder);
		if (next === undefined) break;

		remainder = trimFloat(remainder - (next - value));
		value = next;
	}

	return value;
}

interface Settling {
	exact: ReadonlyMap<number, number>;
	order: ReadonlyArray<number>;
	total: number;
}

// Furthest from its exact share first; a tie goes to the last in pool order
function byShortfall(
	values: ReadonlyArray<number>,
	{ exact, order }: Settling,
	direction: number,
): Array<number> {
	const shortfall = (index: number): number => {
		const value = values[index] ?? NaN;

		return trimFloat(direction * ((exact.get(index) ?? value) - value));
	};

	return order.toReversed().sort((first, second) => shortfall(second) - shortfall(first));
}

function stepEach(
	members: ReadonlyArray<SplitMember>,
	values: Array<number>,
	pass: { neediest: ReadonlyArray<number>; owed: number },
): number {
	let remainder = pass.owed;

	for (const index of pass.neediest) {
		const member = members[index];
		const value = values[index];
		const next = member && value !== undefined ? stepWithin(member, value, remainder) : undefined;
		if (value === undefined || next === undefined) continue;

		values[index] = next;
		remainder = trimFloat(remainder - (next - value));
	}

	return remainder;
}

function settle(
	members: ReadonlyArray<SplitMember>,
	values: Array<number>,
	settling: Settling,
): number {
	let remainder = trimFloat(settling.total - sumOf(values));
	let before = NaN;

	while (remainder !== before && Math.abs(remainder) > epsilon) {
		before = remainder;
		remainder = stepEach(members, values, {
			neediest: byShortfall(values, settling, Math.sign(remainder)),
			owed: remainder,
		});
	}

	return remainder;
}

function pooled(
	members: ReadonlyArray<SplitMember>,
	order: ReadonlyArray<number>,
	owed: number,
): Array<Pooled> {
	return order.flatMap((at): Array<Pooled> => {
		const member = members[at];
		if (!member) return [];

		const room = owed > 0 ? member.max - member.value : member.value - member.min;

		return [{ index: at, room: Math.max(0, room), weight: member.value - member.min }];
	});
}

function shares(pool: Array<Pooled>, owed: number, mode: SplitMode): Map<number, number> {
	if (mode === 'cascade') return spreadInOrder(owed, pool);
	if (mode === 'equal')
		return spreadWeighted(
			owed,
			pool.map((entry) => ({ ...entry, weight: 1 })),
		);

	return spreadWeighted(owed, pool);
}

function landMover(
	members: ReadonlyArray<SplitMember>,
	values: Array<number>,
	move: SplitMove & { total: number },
): number | undefined {
	const { index, target, total } = move;
	const mover = members[index];
	if (!mover?.isFree || !Number.isFinite(target)) return undefined;

	const next = mover.snap(clamp(target, ...splitLimits(members, index, total)));

	values[index] = next;

	return mover.value - next;
}

function landShares(
	members: ReadonlyArray<SplitMember>,
	values: Array<number>,
	spread: ReadonlyMap<number, number>,
): Map<number, number> {
	const exact = new Map<number, number>();

	for (const [at, share] of spread) {
		const member = members[at];
		if (!member) continue;

		exact.set(at, member.value + share);
		values[at] = clamp(member.snap(member.value + share), member.min, member.max);
	}

	return exact;
}

interface Spread {
	left: number;
	order: ReadonlyArray<number>;
	values: Array<number>;
}

function spread(
	members: ReadonlyArray<SplitMember>,
	rule: SplitRule,
	move?: SplitMove,
): Spread | undefined {
	const values = members.map(({ value }) => value);
	const owed = move
		? landMover(members, values, { ...move, total: rule.total })
		: rule.total - sumOf(values);
	if (owed === undefined) return undefined;

	const order = poolOrder(members, move?.index ?? -1);
	const exact = landShares(members, values, shares(pooled(members, order, owed), owed, rule.mode));

	return { left: settle(members, values, { exact, order, total: rule.total }), order, values };
}

function smallestStep(
	members: ReadonlyArray<SplitMember>,
	{ left, order, values }: Spread,
): number | undefined {
	const steps = order.flatMap((at) => {
		const member = members[at];
		const value = values[at];
		if (!member || value === undefined) return [];

		const next = member.stepFrom(value, left > 0 ? 1 : -1);
		const isInside = next >= member.min && next <= member.max;

		return isInside && next !== value ? [trimFloat(next - value)] : [];
	});

	return steps.toSorted((one, other) => Math.abs(one) - Math.abs(other))[0];
}

// The mover takes what is left on its own grid, or a sibling steps past the total and the mover gives the difference back
function moverTargets(
	members: ReadonlyArray<SplitMember>,
	landing: Spread,
	index: number,
): Array<number> {
	const mover = members[index];
	const landed = landing.values[index];
	if (!mover || landed === undefined) return [];

	const step = smallestStep(members, landing);
	const held = stepToward(mover, landed, landing.left);

	return step === undefined
		? [held]
		: [held, stepToward(mover, landed, trimFloat(landing.left - step))];
}

function nearest(
	candidates: Array<Array<number>>,
	move: SplitMove,
	from: { landed: number; start: number },
): Array<number> | undefined {
	const { direction = 0, index } = move;
	const moverOf = (candidate: Array<number>): number => candidate[index] ?? NaN;
	const [first, ...rest] = candidates.toSorted(
		(one, other) => Math.abs(moverOf(one) - from.landed) - Math.abs(moverOf(other) - from.landed),
	);
	if (!first || direction === 0 || moverOf(first) !== from.start) return first;

	return (
		rest.find((candidate) => Math.sign(moverOf(candidate) - from.start) === direction) ?? first
	);
}

function close(
	members: ReadonlyArray<SplitMember>,
	rule: SplitRule,
	held: { landing: Spread; move: SplitMove; mover: SplitMember },
): Array<number> {
	const { landing, move, mover } = held;
	const { index } = move;
	const landed = landing.values[index] ?? mover.value;
	const targets = moverTargets(members, landing, index);
	const closed = targets.flatMap((target) => {
		const attempt = spread(members, rule, { index, target });

		return attempt && Math.abs(attempt.left) <= epsilon ? [attempt.values] : [];
	});

	return (
		nearest(closed, move, { landed, start: mover.value }) ??
		landing.values.with(index, targets[0] ?? landed)
	);
}

export function distribute(
	members: ReadonlyArray<SplitMember>,
	rule: SplitRule,
	move?: SplitMove,
): Array<number> {
	const landing = spread(members, rule, move);
	if (!landing) return members.map(({ value }) => value);

	const mover = members[move?.index ?? -1];
	if (!move || !mover || Math.abs(landing.left) <= epsilon) return landing.values;

	return close(members, rule, { landing, move, mover });
}
