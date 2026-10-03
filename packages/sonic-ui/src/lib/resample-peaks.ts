function bucketBounds(sourceLength: number, index: number, count: number): [number, number] {
	const start = Math.floor((index * sourceLength) / count);

	return [start, Math.max(start + 1, Math.floor(((index + 1) * sourceLength) / count))];
}

function downsample(peaks: ArrayLike<number>, count: number): Array<number> {
	const resampled: Array<number> = [];

	for (let index = 0; index < count; index += 1) {
		const [start, end] = bucketBounds(peaks.length, index, count);
		let total = 0;

		for (let source = start; source < end; source += 1) total += peaks[source] ?? 0;
		resampled.push(total / (end - start));
	}

	return resampled;
}

function upsample(peaks: ArrayLike<number>, count: number): Array<number> {
	const resampled: Array<number> = [];
	const last = peaks.length - 1;

	for (let index = 0; index < count; index += 1) {
		const place = count === 1 ? 0 : (index * last) / (count - 1);
		const before = Math.floor(place);
		const weight = place - before;

		resampled.push(
			(peaks[before] ?? 0) * (1 - weight) + (peaks[Math.min(last, before + 1)] ?? 0) * weight,
		);
	}

	return resampled;
}

export function resamplePeaks(peaks: ArrayLike<number>, count: number): Array<number> {
	if (count <= 0 || peaks.length === 0) return [];

	const finite = Array.from(peaks, (peak) => (Number.isFinite(peak) ? peak : 0));

	if (count === finite.length) return finite;
	if (count > finite.length) return upsample(finite, count);

	return downsample(finite, count);
}
