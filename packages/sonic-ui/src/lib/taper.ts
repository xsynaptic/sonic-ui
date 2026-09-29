// Positions run 0 to 1 along the travel
export interface Taper {
	position: (value: number) => number;
	value: (position: number) => number;
}

export function clampUnit(fraction: number): number {
	return Math.min(1, Math.max(0, fraction));
}

export function wrapUnit(fraction: number): number {
	return fraction - Math.floor(fraction);
}

export function linearTaper(min: number, max: number): Taper {
	const range = max - min;

	return {
		position: (value) => (range > 0 ? clampUnit((value - min) / range) : 0),
		value: (position) => min + clampUnit(position) * range,
	};
}

export function logTaper(min: number, max: number): Taper | undefined {
	if (min <= 0 || max <= min) return undefined;

	const span = Math.log(max / min);

	return {
		position: (value) => clampUnit(Math.log(Math.max(min, value) / min) / span),
		value: (position) => min * Math.exp(clampUnit(position) * span),
	};
}

// JUCE's skew: a power curve through `midpoint` at half the travel
export function skewTaper(min: number, max: number, midpoint: number): Taper | undefined {
	const range = max - min;
	const proportion = (midpoint - min) / range;

	if (proportion === 0.5 || !(proportion > 0 && proportion < 1)) return undefined;

	const skew = Math.log(0.5) / Math.log(proportion);

	return {
		position: (value) => clampUnit((value - min) / range) ** skew,
		value: (position) => min + range * clampUnit(position) ** (1 / skew),
	};
}
