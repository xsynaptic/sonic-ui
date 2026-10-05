import type { ValueMapping } from '#lib/value-mapping.ts';

export interface AskedValue {
	asked: number | undefined;
	value: number;
}

// A gesture: what was asked is the snapped value
// eslint-disable-next-line unicorn/consistent-boolean-name -- a writer; the result says whether the value moved
export function moveTo(cell: AskedValue, mapping: ValueMapping, next: number): boolean {
	if (!Number.isFinite(next)) return false;

	const snapped = mapping.snap(next);

	cell.asked = snapped;
	if (snapped === cell.value) return false;

	cell.value = snapped;

	return true;
}

// A host write: the raw ask survives a change of range
// eslint-disable-next-line unicorn/consistent-boolean-name -- a writer; the result says whether the value moved
export function setAsked(cell: AskedValue, mapping: ValueMapping, next: number): boolean {
	if (!Number.isFinite(next)) return false;

	const hasMoved = moveTo(cell, mapping, next);

	cell.asked = next;

	return hasMoved;
}

export function resnap(cell: AskedValue, mapping: ValueMapping, fallback: number): void {
	cell.value = mapping.snap(cell.asked ?? fallback);
}
