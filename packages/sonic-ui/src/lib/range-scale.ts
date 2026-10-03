import type { Taper } from '#lib/taper.ts';

import { clamp, decimalPlaces, roundTo, trimFloat } from '#lib/math.ts';
import { nearestEntry } from '#lib/number-list.ts';
import { linearTaper, listTaper, logTaper, skewTaper } from '#lib/taper.ts';

export interface RangeSpec {
	detent?: number;
	entries?: ReadonlyArray<number>;
	isNotched: boolean;
	isWrapping: boolean;
	max: number;
	midpoint?: number;
	min: number;
	step: number;
	taper: 'linear' | 'log';
}

export interface RangeScale {
	readonly bounds: [number, number];
	readonly isWrapping: boolean;
	readonly keyTarget: (key: string, from: number, keyStep?: number) => number | undefined;
	readonly place: (value: number) => number;
	readonly positions: number | undefined;
	readonly snap: (value: number) => number;
	readonly valueAt: (place: number) => number;
}

// A Mac keyboard's Delete sends Backspace
export const resetKeys = new Set(['Backspace', 'Delete']);

const pageSteps = 10;

const keySteps = new Map([
	['ArrowDown', -1],
	['ArrowLeft', -1],
	['ArrowRight', 1],
	['ArrowUp', 1],
	['PageDown', -pageSteps],
	['PageUp', pageSteps],
]);

function curveOf(spec: RangeSpec, max: number): Taper | undefined {
	const { entries, min } = spec;
	if (entries) return listTaper(entries);
	if (spec.isNotched || spec.isWrapping) return undefined;

	const log = spec.taper === 'log' ? logTaper(min, max) : undefined;

	return log ?? skewTaper(min, max, spec.midpoint ?? NaN);
}

function countPositions(spec: RangeSpec, positions: number): number | undefined {
	if (!spec.isNotched || !Number.isFinite(positions) || positions < 2) return;

	return positions;
}

// A wrapping scale stops a step short of max, which is min again
function countSteps(spec: RangeSpec, range: number): number {
	if (spec.step <= 0) return NaN;

	const fit = trimFloat(range / spec.step);

	return spec.isWrapping ? Math.max(1, Math.ceil(fit)) : Math.floor(fit) + 1;
}

export function rangeScale(spec: RangeSpec): RangeScale {
	const { entries, min, step } = spec;
	const max = Math.max(min, spec.max);
	const range = max - min;
	const count = countSteps(spec, range);
	const isStepped = step > 0 && !entries;
	const curve = curveOf(spec, max);
	const taper = curve ?? linearTaper(min, max);

	// Decimal places, since significant digits keep the float residue beside 0
	function round(value: number): number {
		if (step <= 0) return trimFloat(value);

		return roundTo(value, Math.max(decimalPlaces(step), decimalPlaces(min)));
	}

	const top = round((count - 1) * step);

	function limits(): [number, number] {
		if (entries) return [entries[0] ?? min, entries.at(-1) ?? max];

		return [min, isStepped && !spec.isWrapping ? round(min + top) : max];
	}

	const bounds = limits();

	function wrap(value: number, span: number): number {
		const offset = round((((value - min) % span) + span) % span);

		return offset >= span ? 0 : offset;
	}

	function bound(value: number): number {
		if (!spec.isWrapping) return clamp(value, ...bounds);
		if (range <= 0) return min;

		return round(min + wrap(value, range));
	}

	// A step that does not divide the range leaves a short seam, where a value goes to the nearer side
	function ring(value: number, span: number): number {
		if (range <= 0) return min;

		const offset = wrap(value, span);
		if (offset > top) return span - offset <= offset - top ? min : round(min + top);

		return round(min + Math.round(offset / step) * step);
	}

	function snap(value: number): number {
		if (entries) return nearestEntry(entries, value);
		if (step <= 0) return bound(round(value));
		if (spec.isWrapping) return ring(value, range);

		return bound(round(min + Math.round((value - min) / step) * step));
	}

	function stepBy(from: number, steps: number, size: number): number {
		if (entries) {
			const index = clamp(entries.indexOf(from) + steps, 0, entries.length - 1);

			return entries[index] ?? from;
		}
		if (!curve) return from + steps * size;

		const next = snap(curve.valueAt(curve.place(from) + steps / 100));

		return next === from ? from + Math.sign(steps) * size : next;
	}

	function stopAtDetent(from: number, next: number): number {
		if (spec.detent === undefined) return next;

		const detent = snap(spec.detent);

		return (from - detent) * (next - detent) < 0 ? detent : next;
	}

	function end(size: number): number {
		if (!spec.isWrapping) return bounds[1];

		return min + (isStepped ? top : (Math.ceil(range / size) - 1) * size);
	}

	function target(key: string, from: number, keyStep: number): number | undefined {
		if (key === 'Home') return bounds[0];

		const size = step > 0 ? step : range / 100;
		if (key === 'End') return snap(end(size));

		const steps = keySteps.get(key);
		if (steps === undefined) return undefined;

		const next = stopAtDetent(from, stepBy(from, steps, keyStep > 0 ? keyStep : size));

		return isStepped && spec.isWrapping ? ring(next, count * step) : snap(next);
	}

	return {
		bounds,
		isWrapping: spec.isWrapping,
		keyTarget: (key, from, keyStep = 0) => target(key, from, keyStep),
		place: (value) => taper.place(bound(value)),
		positions: countPositions(spec, entries?.length ?? count),
		snap,
		valueAt: (place) => taper.valueAt(place),
	};
}
