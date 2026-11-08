export interface RovingGrid {
	columns: number;
	count: number;
}

const moves = {
	ArrowDown: (columns: number) => -columns,
	ArrowLeft: () => -1,
	ArrowRight: () => 1,
	ArrowUp: (columns: number) => columns,
} as const;

function isMoveKey(key: string): key is keyof typeof moves {
	return Object.hasOwn(moves, key);
}

export function rovingIndex(
	index: number,
	key: string,
	{ columns, count }: RovingGrid,
): number | undefined {
	if (key === 'Home') return 0;
	if (key === 'End') return count - 1;
	if (!isMoveKey(key)) return undefined;

	const next = index + moves[key](columns);

	return next >= 0 && next < count ? next : index;
}
