export function parseNumberList(text: null | string): Array<number> | undefined {
	if (text === null) return undefined;

	const numbers = [
		...new Set(
			text
				.split(/[\s,]+/)
				.filter(Boolean)
				.map(Number)
				.filter((entry) => Number.isFinite(entry)),
		),
	].toSorted((first, second) => first - second);

	return numbers.length >= 2 ? numbers : undefined;
}

export function nearestPosition(positions: ReadonlyArray<number>, value: number): number {
	let nearest = positions[0] ?? value;

	for (const position of positions) {
		if (Math.abs(position - value) < Math.abs(nearest - value)) nearest = position;
	}

	return nearest;
}
