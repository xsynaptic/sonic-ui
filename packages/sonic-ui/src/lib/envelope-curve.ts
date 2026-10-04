const flatCurve = 0.001;

export function envelopeCurve(position: number, curve: number): number {
	if (Math.abs(curve) < flatCurve) return position;

	return Math.expm1(curve * position) / Math.expm1(curve);
}
