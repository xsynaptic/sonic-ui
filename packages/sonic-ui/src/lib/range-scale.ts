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

function countPositions(spec: RangeSpec, range: number): number | undefined {
	const positions =
		spec.entries?.length ?? Math.round(range / spec.step) + (spec.isWrapping ? 0 : 1);

	if (!spec.isNotched || !Number.isFinite(positions) || positions < 2) return;

	return positions;
}

export function rangeScale(spec: RangeSpec): RangeScale {
	const { entries, min, step } = spec;
	const max = Math.max(min, spec.max);
	const range = max - min;
	const bounds: [number, number] = [entries?.[0] ?? min, entries?.at(-1) ?? max];
	const curve = curveOf(spec, max);
	const taper = curve ?? linearTaper(min, max);

	// Decimal places, since significant digits keep the float residue beside 0
	function round(value: number): number {
		if (step <= 0) return trimFloat(value);

		return roundTo(value, Math.max(decimalPlaces(step), decimalPlaces(min)));
	}

	function bound(value: number): number {
		if (!spec.isWrapping) return clamp(value, ...bounds);
		if (range <= 0) return min;

		const offset = round((((value - min) % range) + range) % range);

		return offset >= range ? min : round(min + offset);
	}

	function snap(value: number): number {
		if (entries) return nearestEntry(entries, value);

		const stepped = step > 0 ? min + Math.round((value - min) / step) * step : value;

		return bound(round(stepped));
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

	function target(key: string, from: number, keyStep: number): number | undefined {
		if (key === 'Home') return bounds[0];

		const size = step > 0 ? step : range / 100;

		if (key === 'End')
			return spec.isWrapping ? min + (Math.ceil(range / size) - 1) * size : bounds[1];

		const steps = keySteps.get(key);
		if (steps === undefined) return undefined;

		return stopAtDetent(from, stepBy(from, steps, keyStep > 0 ? keyStep : size));
	}

	return {
		bounds,
		isWrapping: spec.isWrapping,
		keyTarget(key, from, keyStep = 0) {
			const next = target(key, from, keyStep);

			return next === undefined ? undefined : snap(next);
		},
		place: (value) => taper.place(bound(value)),
		positions: countPositions(spec, range),
		snap,
		valueAt: (place) => taper.valueAt(place),
	};
}
