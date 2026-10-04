import { clampProportion } from '#lib/math.ts';

export interface Taper {
	proportionOf: (value: number) => number;
	valueAt: (proportion: number) => number;
}

export function linearTaper(min: number, max: number): Taper {
	const range = max - min;

	return {
		proportionOf: (value) => (range > 0 ? clampProportion((value - min) / range) : 0),
		valueAt: (proportion) => min + clampProportion(proportion) * range,
	};
}

export function logTaper(min: number, max: number): Taper | undefined {
	if (min <= 0 || max <= min) return undefined;

	const span = Math.log(max / min);

	return {
		proportionOf: (value) => clampProportion(Math.log(Math.max(min, value) / min) / span),
		valueAt: (proportion) => {
			const clamped = clampProportion(proportion);
			if (clamped === 0) return min;
			if (clamped === 1) return max;

			return min * Math.exp(clamped * span);
		},
	};
}

// JUCE's skew: a power curve through `midpoint` at half the travel
export function skewTaper(min: number, max: number, midpoint: number): Taper | undefined {
	const range = max - min;
	const midpointProportion = (midpoint - min) / range;

	if (midpointProportion === 0.5 || !(midpointProportion > 0 && midpointProportion < 1))
		return undefined;

	const skew = Math.log(0.5) / Math.log(midpointProportion);

	return {
		proportionOf: (value) => clampProportion((value - min) / range) ** skew,
		valueAt: (proportion) => min + range * clampProportion(proportion) ** (1 / skew),
	};
}

export function listTaper(positions: ReadonlyArray<number>): Taper {
	const last = positions.length - 1;

	return {
		proportionOf: (value) => {
			if (Number.isNaN(value)) return NaN;

			const above = positions.findIndex((position) => position >= value);
			if (above === -1) return 1;

			const high = positions[above];
			const low = positions[above - 1];
			if (high === undefined || low === undefined) return 0;

			return (above - 1 + (value - low) / (high - low)) / last;
		},
		valueAt: (proportion) => positions[Math.round(clampProportion(proportion) * last)] ?? NaN,
	};
}
