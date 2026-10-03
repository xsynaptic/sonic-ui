import { expect, test } from 'vitest';

import { waveformBuckets } from '#lib/waveform-buckets.ts';

const pairsPerSecond = 172.265625;

function silence(pairs: number): { fullScale: number; pairsPerSecond: number; samples: Int8Array } {
	return { fullScale: 128, pairsPerSecond, samples: new Int8Array(pairs * 2) };
}

test('a window moved by a third of a bucket keeps every bucket and shifts only x', () => {
	const data = silence(4000);
	const view = { pixelsPerSecond: 90, width: 200 };
	const pxPerPair = 90 / pairsPerSecond;
	const before = waveformBuckets(data, { ...view, startSeconds: 1000 / pairsPerSecond });
	const after = waveformBuckets(data, {
		...view,
		startSeconds: (1000 + 2 / 3) / pairsPerSecond,
	});

	expect(after.map(({ fromPair, toPair }) => [fromPair, toPair])).toEqual(
		before.map(({ fromPair, toPair }) => [fromPair, toPair]),
	);
	for (const [index, bucket] of after.entries()) {
		expect(bucket.x).toBeCloseTo((before[index]?.x ?? NaN) - (2 / 3) * pxPerPair, 9);
	}
});

test('16-bit and float data of the same shape draw the same heights', () => {
	const view = { pixelsPerSecond: pairsPerSecond, startSeconds: 0, width: 4 };
	const wide = waveformBuckets(
		{ fullScale: 32_768, pairsPerSecond, samples: new Int16Array([-16_384, 8192, -4096, 32_767]) },
		view,
	);
	const float = waveformBuckets(
		{
			fullScale: 1,
			pairsPerSecond,
			samples: new Float32Array([-0.5, 0.25, -0.125, 32_767 / 32_768]),
		},
		view,
	);

	expect(wide.map(({ high, low }) => [low, high])).toEqual(
		float.map(({ high, low }) => [low, high]),
	);
	expect(wide.find((bucket) => bucket.fromPair === 0)).toMatchObject({ high: 0.25, low: -0.5 });
});

test('two channels fold to the lowest min and the highest max', () => {
	const bucket = waveformBuckets(
		{ channels: 2, fullScale: 128, pairsPerSecond, samples: new Int8Array([-16, 64, -32, 8]) },
		{ pixelsPerSecond: pairsPerSecond, startSeconds: 0, width: 1 },
	).find(({ fromPair }) => fromPair === 0);

	expect(bucket).toMatchObject({ high: 0.5, low: -0.25 });
});

test('a bucket past the first folds only its own pairs, across both channels', () => {
	const samples = new Int8Array([
		-120, 120, -120, 120, -120, 120, -120, 120, -8, 4, -16, 2, -4, 32, -2, 64,
	]);
	const bucket = waveformBuckets(
		{ channels: 2, fullScale: 128, pairsPerSecond, samples },
		{ pixelsPerSecond: pairsPerSecond / 2, startSeconds: 0, width: 4 },
	).find(({ fromPair }) => fromPair === 2);

	expect(bucket).toMatchObject({ high: 0.5, low: -0.125, toPair: 4 });
});

test('the buckets cover the window from before its start to just past its end', () => {
	const width = 120;
	const buckets = waveformBuckets(silence(4000), {
		pixelsPerSecond: pairsPerSecond * 0.4,
		startSeconds: 0,
		width,
	});

	expect(buckets[0]?.x).toBeLessThanOrEqual(0);
	expect(buckets.at(-1)?.x).toBeGreaterThanOrEqual(width);
	expect(buckets.at(-1)?.x).toBeLessThan(width + 3 * 1.2);
});
