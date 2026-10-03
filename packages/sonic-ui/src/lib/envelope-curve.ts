const flatBend = 0.001;

export function envelopeCurve(position: number, bend: number): number {
	if (Math.abs(bend) < flatBend) return position;

	return Math.expm1(bend * position) / Math.expm1(bend);
}
