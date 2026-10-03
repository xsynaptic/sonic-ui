import { clampUnit } from '#lib/math.ts';

export interface Taper {
	place: (value: number) => number;
	valueAt: (place: number) => number;
}

export function linearTaper(min: number, max: number): Taper {
	const range = max - min;

	return {
		place: (value) => (range > 0 ? clampUnit((value - min) / range) : 0),
		valueAt: (place) => min + clampUnit(place) * range,
	};
}

export function logTaper(min: number, max: number): Taper | undefined {
	if (min <= 0 || max <= min) return undefined;

	const span = Math.log(max / min);

	return {
		place: (value) => clampUnit(Math.log(Math.max(min, value) / min) / span),
		valueAt: (place) => min * Math.exp(clampUnit(place) * span),
	};
}

// JUCE's skew: a power curve through `midpoint` at half the travel
export function skewTaper(min: number, max: number, midpoint: number): Taper | undefined {
	const range = max - min;
	const proportion = (midpoint - min) / range;

	if (proportion === 0.5 || !(proportion > 0 && proportion < 1)) return undefined;

	const skew = Math.log(0.5) / Math.log(proportion);

	return {
		place: (value) => clampUnit((value - min) / range) ** skew,
		valueAt: (place) => min + range * clampUnit(place) ** (1 / skew),
	};
}

export function listTaper(entries: ReadonlyArray<number>): Taper {
	const last = entries.length - 1;

	return {
		place: (value) => {
			const above = entries.findIndex((entry) => entry >= value);
			if (above === -1) return 1;

			const high = entries[above];
			const low = entries[above - 1];
			if (high === undefined || low === undefined) return 0;

			return (above - 1 + (value - low) / (high - low)) / last;
		},
		valueAt: (place) => entries[Math.round(clampUnit(place) * last)] ?? NaN,
	};
}
