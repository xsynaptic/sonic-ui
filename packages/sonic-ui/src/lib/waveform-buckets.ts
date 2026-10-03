// Interleaved min, max per channel per pair; `fullScale` is 128, 32768 or 1
export interface WaveformData {
	channels?: number;
	fullScale: number;
	pairsPerSecond: number;
	samples: Float32Array | Int8Array | Int16Array;
}

export interface WaveformBucket {
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

function foldPairs(data: WaveformData, fromPair: number, toPair: number): [number, number] {
	const { samples } = data;
	const channels = Math.max(1, data.channels ?? 1);
	const stride = channels * 2;
	const pairsTotal = Math.floor(samples.length / stride);
	let low = 0;
	let high = 0;

	for (let pair = Math.max(0, fromPair); pair < Math.min(pairsTotal, toPair); pair += 1) {
		for (let channel = 0; channel < channels; channel += 1) {
			const at = pair * stride + channel * 2;

			low = Math.min(low, samples[at] ?? 0);
			high = Math.max(high, samples[at + 1] ?? 0);
		}
	}

	return [low / data.fullScale, high / data.fullScale];
}

// Keyed to absolute pairs; keyed to the window, the same samples re-bucket every frame and judder
export function waveformBuckets(data: WaveformData, view: BucketView): Array<WaveformBucket> {
	const { pairsPerSecond } = data;
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
		const [low, high] = foldPairs(data, fromPair, toPair);

		buckets.push({ fromPair, high, low, toPair, x: (fromPair - openingPair) * pxPerPair });
	}

	return buckets;
}
