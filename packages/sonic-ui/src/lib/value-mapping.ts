import type { Taper } from '#lib/taper.ts';

import { clamp, decimalPlaces, roundTo, trimFloat } from '#lib/math.ts';
import { nearestPosition } from '#lib/number-list.ts';
import { linearTaper, listTaper, logTaper, skewTaper } from '#lib/taper.ts';

export interface ValueSpec {
	detent?: number;
	isNotched: boolean;
	isWrapping: boolean;
	max: number;
	midpoint?: number;
	min: number;
	positions?: ReadonlyArray<number>;
	step: number;
	taper: 'linear' | 'log';
}

export interface ValueMapping {
	readonly bounds: [number, number];
	readonly isWrapping: boolean;
	readonly keyTarget: (key: string, from: number, keyStep?: number) => number | undefined;
	readonly positionCount: number | undefined;
	readonly proportionOf: (value: number) => number;
	readonly snap: (value: number) => number;
	readonly valueAt: (proportion: number) => number;
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

function curveOf(spec: ValueSpec, max: number): Taper | undefined {
	const { min, positions } = spec;
	if (positions) return listTaper(positions);
	if (spec.isNotched || spec.isWrapping) return undefined;

	const log = spec.taper === 'log' ? logTaper(min, max) : undefined;

	return log ?? skewTaper(min, max, spec.midpoint ?? NaN);
}

function countPositions(spec: ValueSpec, count: number): number | undefined {
	if (!spec.isNotched || !Number.isFinite(count) || count < 2) return;

	return count;
}

// A wrapping mapping stops a step short of max, which is min again
function countSteps(spec: ValueSpec, range: number): number {
	if (spec.step <= 0) return NaN;

	const fit = trimFloat(range / spec.step);

	return spec.isWrapping ? Math.max(1, Math.ceil(fit)) : Math.floor(fit) + 1;
}

export function valueMapping(spec: ValueSpec): ValueMapping {
	const { min, positions, step } = spec;
	const max = Math.max(min, spec.max);
	const range = max - min;
	const count = countSteps(spec, range);
	const isStepped = step > 0 && !positions;
	const curve = curveOf(spec, max);
	const taper = curve ?? linearTaper(min, max);

	// Decimal places, since significant digits keep the float residue beside 0
	function round(value: number): number {
		if (step <= 0) return trimFloat(value);

		return roundTo(value, Math.max(decimalPlaces(step), decimalPlaces(min)));
	}

	const top = round((count - 1) * step);

	function limits(): [number, number] {
		if (positions) return [positions[0] ?? min, positions.at(-1) ?? max];

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
		if (positions) return nearestPosition(positions, value);
		if (step <= 0) return bound(round(value));
		if (spec.isWrapping) return ring(value, range);

		return bound(round(min + Math.round((value - min) / step) * step));
	}

	function stepBy(from: number, steps: number, size: number): number {
		if (positions) {
			const index = clamp(positions.indexOf(from) + steps, 0, positions.length - 1);

			return positions[index] ?? from;
		}
		if (!curve) return from + steps * size;

		const next = snap(curve.valueAt(curve.proportionOf(from) + steps / 100));

		return next === from ? from + Math.sign(steps) * size : next;
	}

	function stopAtDetent(from: number, next: number): number {
		if (spec.detent === undefined) return next;

		const detent = snap(spec.detent);
		const toward = Math.sign(next - from) * (detent - from);
		const ahead = spec.isWrapping ? wrap(min + toward, isStepped ? count * step : range) : toward;

		return ahead > 0 && ahead < Math.abs(next - from) ? detent : next;
	}

	function keyStride(keyStep: number): number | undefined {
		if (positions || !(keyStep > 0)) return undefined;

		return step > 0 ? Math.max(1, Math.round(trimFloat(keyStep / step))) * step : keyStep;
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

		const stride = keyStride(keyStep);
		const moved = stride === undefined ? stepBy(from, steps, size) : from + steps * stride;
		const next = stopAtDetent(from, moved);

		return isStepped && spec.isWrapping ? ring(next, count * step) : snap(next);
	}

	return {
		bounds,
		isWrapping: spec.isWrapping,
		keyTarget: (key, from, keyStep = 0) => target(key, from, keyStep),
		positionCount: countPositions(spec, positions?.length ?? count),
		proportionOf: (value) => taper.proportionOf(bound(value)),
		snap,
		valueAt: (proportion) => taper.valueAt(proportion),
	};
}
