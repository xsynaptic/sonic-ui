export function parseNumberList(text: null | string): Array<number> | undefined {
	if (text === null) return undefined;

	const entries = [
		...new Set(
			text
				.split(/[\s,]+/)
				.filter(Boolean)
				.map(Number)
				.filter((entry) => Number.isFinite(entry)),
		),
	].toSorted((first, second) => first - second);

	return entries.length >= 2 ? entries : undefined;
}

export function nearestEntry(entries: ReadonlyArray<number>, value: number): number {
	let nearest = entries[0] ?? value;

	for (const entry of entries) {
		if (Math.abs(entry - value) < Math.abs(nearest - value)) nearest = entry;
	}

	return nearest;
}
