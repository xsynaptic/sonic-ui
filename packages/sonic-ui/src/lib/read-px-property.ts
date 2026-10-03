// Registered properties only; a registered `<length>` always computes to px
export function readPxProperty(
	styles: CSSStyleDeclaration,
	property: string,
	fallback: number,
): number {
	// eslint-disable-next-line unicorn/prefer-number-coercion -- parsing has to stop at the unit
	const parsed = Number.parseFloat(styles.getPropertyValue(property));

	return Number.isFinite(parsed) ? parsed : fallback;
}
