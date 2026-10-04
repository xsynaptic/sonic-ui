export type TimeRegions = Iterable<readonly [number, number]> | TimeRanges;

export function readRegions(regions: TimeRegions): Array<[number, number]> {
	if ('start' in regions) {
		return Array.from({ length: regions.length }, (_entry, index) => [
			regions.start(index),
			regions.end(index),
		]);
	}

	return [...regions].map(([start, end]) => [start, end]);
}
