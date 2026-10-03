import { clamp, trimFloat } from '#lib/math.ts';

export interface SumMember {
	isFree: boolean;
	max: number;
	min: number;
	snap: (value: number) => number;
	stepFrom: (value: number, direction: -1 | 1) => number;
	value: number;
}

export type SumMode = 'cascade' | 'equal' | 'proportional';

export interface SumMove {
	index: number;
	target: number;
}

export interface SumRule {
	mode: SumMode;
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

function others(members: ReadonlyArray<SumMember>, index: number): Array<SumMember> {
	return members.filter((_member, at) => at !== index);
}

export function sumLimits(
	members: ReadonlyArray<SumMember>,
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

function poolOrder(members: ReadonlyArray<SumMember>, index: number): Array<number> {
	const count = members.length;
	const start = index + 1;

	return Array.from({ length: count }, (_entry, offset) => (start + offset) % count).filter(
		(at) => at !== index && members[at]?.isFree === true,
	);
}

function stepToward(member: SumMember, from: number, owed: number): [number, number] {
	let value = from;
	let remainder = owed;

	while (Math.abs(remainder) > epsilon) {
		const next = member.stepFrom(value, remainder > 0 ? 1 : -1);
		const change = trimFloat(next - value);
		const isInside = next >= member.min && next <= member.max;

		if (change === 0 || !isInside || Math.abs(change) > Math.abs(remainder) + epsilon) break;

		value = next;
		remainder = trimFloat(remainder - change);
	}

	return [value, remainder];
}

function settle(
	members: ReadonlyArray<SumMember>,
	values: Array<number>,
	rule: SumRule & { order: ReadonlyArray<number> },
): void {
	let remainder = trimFloat(rule.total - sumOf(values));

	for (const index of rule.order.toReversed()) {
		const member = members[index];
		if (!member) continue;

		const [value, left] = stepToward(member, values[index] ?? member.value, remainder);

		values[index] = value;
		remainder = left;
	}
}

function pooled(
	members: ReadonlyArray<SumMember>,
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

function shares(pool: Array<Pooled>, owed: number, mode: SumMode): Map<number, number> {
	if (mode === 'cascade') return spreadInOrder(owed, pool);
	if (mode === 'equal')
		return spreadWeighted(
			owed,
			pool.map((entry) => ({ ...entry, weight: 1 })),
		);

	return spreadWeighted(owed, pool);
}

function landMover(
	members: ReadonlyArray<SumMember>,
	values: Array<number>,
	move: SumMove & { total: number },
): number | undefined {
	const { index, target, total } = move;
	const mover = members[index];
	if (!mover?.isFree) return undefined;

	const next = mover.snap(clamp(target, ...sumLimits(members, index, total)));

	values[index] = next;

	return mover.value - next;
}

export function distribute(
	members: ReadonlyArray<SumMember>,
	rule: SumRule,
	move?: SumMove,
): Array<number> {
	const values = members.map(({ value }) => value);
	const owed = move
		? landMover(members, values, { ...move, total: rule.total })
		: rule.total - sumOf(values);
	if (owed === undefined) return values;

	const order = poolOrder(members, move?.index ?? -1);
	const spread = shares(pooled(members, order, owed), owed, rule.mode);

	for (const [at, share] of spread) {
		const member = members[at];

		if (member) values[at] = clamp(member.snap(member.value + share), member.min, member.max);
	}
	settle(members, values, { ...rule, order });

	return values;
}
