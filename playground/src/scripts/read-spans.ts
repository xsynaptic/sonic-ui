export function readSpans(text: string | undefined): Array<[number, number]> {
	const edges = (text ?? '').split(/\s+/).filter(Boolean).map(Number);
	const spans: Array<[number, number]> = [];

	for (let index = 0; index + 1 < edges.length; index += 2) {
		spans.push([edges[index] ?? 0, edges[index + 1] ?? 0]);
	}

	return spans;
}
