const flatCurve = 0.001;

/** `position` is 0 to 1 along a stage; a `curve` of 0 is a straight line */
export function envelopeCurve(position: number, curve: number): number {
	if (Math.abs(curve) < flatCurve) return position;

	return Math.expm1(curve * position) / Math.expm1(curve);
}
