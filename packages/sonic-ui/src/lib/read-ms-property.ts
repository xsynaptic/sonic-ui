// Registered `<time>` properties only; engines differ on whether one computes to s or ms
export function readMsProperty(
	styles: CSSStyleDeclaration,
	property: string,
	fallback: number,
): number {
	const text = styles.getPropertyValue(property).trim();
	// eslint-disable-next-line unicorn/prefer-number-coercion -- parsing has to stop at the unit
	const parsed = Number.parseFloat(text);
	if (!Number.isFinite(parsed)) return fallback;

	return text.endsWith('ms') ? parsed : parsed * 1000;
}
