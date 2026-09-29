export function formatPercent(value: number): string {
	return `${String(Math.round(value * 100))}%`;
}

// An emptied entry reads as NaN, which the control ignores; `Number('')` is 0
export function parsePercent(text: string): number {
	const digits = text.trim().replace(/\s*%$/, '');
	if (digits === '') return NaN;

	return Number(digits) / 100;
}
