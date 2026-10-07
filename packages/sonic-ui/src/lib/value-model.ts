import type { ValueMapping, ValueSpec } from '#lib/value-mapping.ts';

import { clamp } from '#lib/math.ts';
import { valueMapping } from '#lib/value-mapping.ts';

type ValueLanding = (target: number, direction: -1 | 0 | 1) => number;

export interface ValueModel {
	input: (next: number) => boolean;
	land: (target: number, direction: -1 | 0 | 1) => number;
	limit: () => [number, number] | undefined;
	mapping: () => ValueMapping;
	notify: () => void;
	respec: (fallback: number, options?: { forgetAsk?: boolean }) => void;
	setLanding: (resolve: undefined | ValueLanding) => void;
	setLimit: (bounds: [number, number] | undefined) => void;
	readonly value: number;
	watch: (listener: () => void) => () => void;
	write: (next: number) => boolean;
}

export function createValueModel(readSpec: () => ValueSpec): ValueModel {
	const listeners = new Set<() => void>();

	let asked: number | undefined;
	let bounds: [number, number] | undefined;
	let landing: undefined | ValueLanding;
	// Kept until `respec`, so a host observes every attribute its spec reads
	let mapped: undefined | ValueMapping;
	let value = 0;

	function mapping(): ValueMapping {
		if (mapped) return mapped;

		mapped = valueMapping(readSpec());

		return mapped;
	}

	// eslint-disable-next-line unicorn/consistent-boolean-name -- a writer; the result says whether the value moved
	function moveTo(next: number): boolean {
		if (!Number.isFinite(next)) return false;

		const snapped = mapping().snap(next);

		asked = snapped;
		if (snapped === value) return false;

		value = snapped;

		return true;
	}

	return {
		input: (next) => moveTo(bounds ? clamp(next, ...bounds) : next),
		land: (target, direction) => landing?.(target, direction) ?? target,
		limit: () => bounds,
		mapping,
		notify: () => {
			for (const listener of listeners) listener();
		},
		respec: (fallback, options) => {
			mapped = undefined;
			if (options?.forgetAsk === true) asked = undefined;
			value = mapping().snap(asked ?? fallback);
		},
		setLanding: (resolve) => {
			landing = resolve;
		},
		setLimit: (next) => {
			bounds = next;
		},
		get value() {
			return value;
		},
		watch: (listener) => {
			listeners.add(listener);

			return () => {
				listeners.delete(listener);
			};
		},
		write: (next) => {
			const hasMoved = moveTo(next);

			if (Number.isFinite(next)) asked = next;

			return hasMoved;
		},
	};
}
