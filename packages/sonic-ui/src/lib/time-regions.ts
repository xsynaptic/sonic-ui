/** A media element's `buffered` or `seekable` as it is, or any list of start and end pairs */
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

export function dueRegions(
	regions: ReadonlyArray<[number, number]>,
	listedMs: ReadonlyMap<string, number>,
	[nowMs, delayMs]: [number, number],
): Array<[number, number]> {
	if (delayMs <= 0) return [...regions];

	return regions.filter((region) => nowMs - (listedMs.get(region.join(':')) ?? nowMs) >= delayMs);
}

export function sortedRegions(regions: TimeRegions | undefined): Array<[number, number]> {
	return regions ? readRegions(regions).toSorted((first, second) => first[0] - second[0]) : [];
}
