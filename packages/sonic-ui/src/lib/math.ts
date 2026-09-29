export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function clampUnit(fraction: number): number {
	return clamp(fraction, 0, 1);
}

export function wrapUnit(fraction: number): number {
	return fraction - Math.floor(fraction);
}

export function trimFloat(value: number): number {
	return Number(value.toPrecision(12));
}
