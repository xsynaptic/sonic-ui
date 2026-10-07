import { clamp } from '#lib/math.ts';

export interface Position {
	isDisabled: boolean;
	isMomentary: boolean;
}

type Positions = ReadonlyArray<Position>;

// RTL is not mirrored
const keySteps = new Map([
	['ArrowDown', 1],
	['ArrowLeft', -1],
	['ArrowRight', 1],
	['ArrowUp', -1],
]);

function indexOrUndefined(index: number): number | undefined {
	return index < 0 ? undefined : index;
}

function isEnabled(position: Position): boolean {
	return !position.isDisabled;
}

export function enabledEnds(positions: Positions): [number, number] {
	return [positions.findIndex(isEnabled), positions.findLastIndex(isEnabled)];
}

export function stepFrom(
	positions: Positions,
	from: number,
	{ isWrapping, step }: { isWrapping: boolean; step: number },
): number | undefined {
	const count = positions.length;
	let index = from;

	for (const _ of positions) {
		const next = index + step;

		index = isWrapping ? (next + count) % count : clamp(next, 0, count - 1);
		if (positions[index]?.isDisabled === false) return index;
	}

	return undefined;
}

export function keyTarget(
	positions: Positions,
	from: number,
	{ isWrapping, key }: { isWrapping: boolean; key: string },
): number | undefined {
	const [first, last] = enabledEnds(positions);

	if (key === 'Home') return indexOrUndefined(first);
	if (key === 'End') return indexOrUndefined(last);

	const step = keySteps.get(key);
	if (step === undefined) return undefined;

	return stepFrom(positions, from, { isWrapping, step }) ?? from;
}

export function isMomentaryAt(positions: Positions, index: number): boolean {
	const isEnd = index === 0 || index === positions.length - 1;

	return isEnd && positions.length > 1 && positions[index]?.isMomentary === true;
}

export function pressTarget(positions: Positions, checked: number, pressed: number): number {
	return positions.length === 2 && checked >= 0 ? 1 - checked : pressed;
}

export function soleStep(positions: Positions, from: number): number | undefined {
	const ways = [-1, 1]
		.map((step) => stepFrom(positions, from, { isWrapping: false, step }))
		.filter((to) => to !== undefined && to !== from);

	return ways.length === 1 ? ways[0] : undefined;
}

export function restOf(positions: Positions, held: number): number | undefined {
	if (!isMomentaryAt(positions, held)) return undefined;

	return held === 0 ? 1 : held - 1;
}
