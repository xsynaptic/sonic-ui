export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function clampProportion(fraction: number): number {
	return clamp(fraction, 0, 1);
}

export function wrapProportion(fraction: number): number {
	return fraction - Math.floor(fraction);
}

export function trimFloat(value: number): number {
	return Number(value.toPrecision(12));
}

// `String(1e-7)` is "1e-7", so the exponent counts as places too
export function decimalPlaces(value: number): number {
	const [digits = '', exponent = '0'] = String(value).split('e', 2);
	const fraction = digits.split('.', 2)[1] ?? '';

	return Math.max(0, fraction.length - Number(exponent));
}

// `toFixed` takes at most 100 places, and turns a residue below zero into -0
export function roundTo(value: number, places: number): number {
	const rounded = Number(value.toFixed(Math.min(100, places)));

	return rounded === 0 ? 0 : rounded;
}
