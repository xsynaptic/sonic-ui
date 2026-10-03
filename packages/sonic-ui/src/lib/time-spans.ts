export type TimeSpans = Iterable<readonly [number, number]> | TimeRanges;

export function readSpans(spans: TimeSpans): Array<[number, number]> {
	if ('start' in spans) {
		return Array.from({ length: spans.length }, (_entry, index) => [
			spans.start(index),
			spans.end(index),
		]);
	}

	return [...spans].map(([start, end]) => [start, end]);
}
