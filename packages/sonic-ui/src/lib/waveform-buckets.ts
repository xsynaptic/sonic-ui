/** Interleaved min, max per channel per pair; `fullScale` unset follows the array: 128, 32768 or 1 */
export interface WaveformPeaks {
	channels?: number;
	fullScale?: number;
	pairsPerSecond: number;
	samples: Float32Array | Int8Array | Int16Array;
}

interface WaveformBucket {
	fromPair: number;
	high: number;
	low: number;
	toPair: number;
	x: number;
}

interface BucketView {
	pixelsPerSecond: number;
	startSeconds: number;
	width: number;
}

function fullScaleOf({ fullScale, samples }: WaveformPeaks): number {
	if (fullScale !== undefined) return fullScale;
	if (samples instanceof Int8Array) return 128;

	return samples instanceof Int16Array ? 32_768 : 1;
}

function foldPairs(peaks: WaveformPeaks, fromPair: number, toPair: number): [number, number] {
	const { samples } = peaks;
	const channels = Math.max(1, peaks.channels ?? 1);
	const stride = channels * 2;
	const pairsTotal = Math.floor(samples.length / stride);
	const fullScale = fullScaleOf(peaks);
	let low = 0;
	let high = 0;

	for (let pair = Math.max(0, fromPair); pair < Math.min(pairsTotal, toPair); pair += 1) {
		for (let channel = 0; channel < channels; channel += 1) {
			const at = pair * stride + channel * 2;

			low = Math.min(low, samples[at] ?? 0);
			high = Math.max(high, samples[at + 1] ?? 0);
		}
	}

	return [low / fullScale, high / fullScale];
}

// Keyed to absolute pairs; keyed to the window, the same samples re-bucket every frame and judder
export function waveformBuckets(peaks: WaveformPeaks, view: BucketView): Array<WaveformBucket> {
	const { pairsPerSecond } = peaks;
	if (pairsPerSecond <= 0 || view.pixelsPerSecond <= 0) return [];

	const pxPerPair = view.pixelsPerSecond / pairsPerSecond;
	const pairs = Math.max(1, Math.round(1 / pxPerPair));
	const openingPair = view.startSeconds * pairsPerSecond;
	const first = Math.floor(openingPair / pairs) - 1;
	const count = Math.ceil(view.width / (pairs * pxPerPair)) + 3;
	const buckets: Array<WaveformBucket> = [];

	for (let index = 0; index < count; index += 1) {
		const fromPair = (first + index) * pairs;
		const toPair = fromPair + pairs;
		const [low, high] = foldPairs(peaks, fromPair, toPair);

		buckets.push({ fromPair, high, low, toPair, x: (fromPair - openingPair) * pxPerPair });
	}

	return buckets;
}
