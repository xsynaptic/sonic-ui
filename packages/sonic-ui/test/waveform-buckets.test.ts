import { fc, test } from '@fast-check/vitest';
import { assert, expect } from 'vitest';

import type { WaveformPeaks } from '#lib/waveform-buckets.ts';

import { waveformBuckets } from '#lib/waveform-buckets.ts';

const pairsPerSecond = 172.265625;

function silence(pairs: number): { fullScale: number; pairsPerSecond: number; samples: Int8Array } {
	return { fullScale: 128, pairsPerSecond, samples: new Int8Array(pairs * 2) };
}

test('a window moved by a third of a bucket keeps every bucket and shifts only x', () => {
	const peaks = silence(4000);
	const view = { pixelsPerSecond: 90, width: 200 };
	const pxPerPair = 90 / pairsPerSecond;
	const before = waveformBuckets(peaks, { ...view, startSeconds: 1000 / pairsPerSecond });
	const after = waveformBuckets(peaks, {
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

test('16-bit and float peaks of the same shape draw the same heights', () => {
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

function foldOne(peaks: WaveformPeaks): undefined | { high: number; low: number } {
	return waveformBuckets(
		{ ...peaks, pairsPerSecond },
		{ pixelsPerSecond: pairsPerSecond, startSeconds: 0, width: 1 },
	).find(({ fromPair }) => fromPair === 0);
}

test('with no full scale, peaks read against their array, and a full scale that is set wins', () => {
	const narrow = new Int8Array([-32, 64]);

	expect(foldOne({ pairsPerSecond, samples: narrow })).toMatchObject({ high: 0.5, low: -0.25 });
	expect(foldOne({ pairsPerSecond, samples: narrow })).toEqual(
		foldOne({ fullScale: 128, pairsPerSecond, samples: narrow }),
	);
	expect(foldOne({ pairsPerSecond, samples: new Int16Array([-8192, 16_384]) })).toMatchObject({
		high: 0.5,
		low: -0.25,
	});
	expect(
		foldOne({ fullScale: 2, pairsPerSecond, samples: new Float32Array([-0.5, 1]) }),
	).toMatchObject({ high: 0.5, low: -0.25 });
	expect(foldOne({ fullScale: 256, pairsPerSecond, samples: narrow })).toMatchObject({
		high: 0.25,
		low: -0.125,
	});
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

test.each([0, 2.9])(
	'from %d pairs in, the buckets cover the window from before its start to within a bucket past its end',
	(openingPair) => {
		const width = 120;
		const buckets = waveformBuckets(silence(4000), {
			pixelsPerSecond: pairsPerSecond * 0.4,
			startSeconds: openingPair / pairsPerSecond,
			width,
		});

		expect(buckets[0]?.x).toBeLessThanOrEqual(0);
		expect(buckets.at(-1)?.x).toBeGreaterThanOrEqual(width);
		expect(buckets.at(-1)?.x).toBeLessThanOrEqual(width + 1.2 + 1e-9);
	},
);

function bucketAt(
	samples: Int8Array,
	fromPair: number,
	pairsPerPixel = 1,
): undefined | { high: number; low: number } {
	return waveformBuckets(
		{ fullScale: 128, pairsPerSecond, samples },
		{ pixelsPerSecond: pairsPerSecond / pairsPerPixel, startSeconds: 0, width: 8 },
	).find((bucket) => bucket.fromPair === fromPair);
}

// Deliberate: a bar always touches the centerline, so a DC offset never floats it
test('a bucket wholly above zero still reaches the centerline, and one wholly below does too', () => {
	expect(bucketAt(new Int8Array([16, 64, 32, 96]), 1)).toMatchObject({ high: 0.75, low: 0 });
	expect(bucketAt(new Int8Array([-64, -16, -96, -32]), 1)).toMatchObject({ high: 0, low: -0.75 });
});

test('a bucket across the end of the peaks folds only the pairs that exist', () => {
	const samples = new Int8Array([-8, 8, -16, 16, -32, 32, -64, 64, -4, 4]);

	expect(bucketAt(samples, 4, 2)).toMatchObject({ high: 0.03125, low: -0.03125 });
	expect(bucketAt(samples, 6, 2)).toMatchObject({ high: 0, low: 0 });
	expect(bucketAt(samples, -2, 2)).toMatchObject({ high: 0, low: 0 });
});

test('at one and a half pairs a pixel every bucket holds two whole pairs, a pixel and a third apart', () => {
	const buckets = waveformBuckets(silence(4000), {
		pixelsPerSecond: pairsPerSecond / 1.5,
		startSeconds: 100 / pairsPerSecond,
		width: 40,
	});

	for (const [index, bucket] of buckets.entries()) {
		expect(bucket.toPair - bucket.fromPair).toBe(2);
		expect(bucket.fromPair % 2).toBe(0);
		expect(bucket.x).toBeCloseTo((buckets[0]?.x ?? NaN) + (index * 4) / 3, 9);
	}
	expect(buckets.find(({ fromPair }) => fromPair === 100)?.x).toBeCloseTo(0, 9);
});

function loud(pairs: number, channels = 1): Int8Array {
	return Int8Array.from({ length: pairs * channels * 2 }, (_sample, index) =>
		index % 2 === 0 ? -128 : 127,
	);
}

function bodies(
	peaks: Omit<WaveformPeaks, 'pairsPerSecond'>,
	pairsPerPixel: number,
	pairs: number,
): Array<unknown> {
	const buckets = waveformBuckets(
		{ ...peaks, pairsPerSecond },
		{
			pixelsPerSecond: pairsPerSecond / pairsPerPixel,
			startSeconds: 0,
			width: pairs / pairsPerPixel,
		},
	);

	return Array.from(
		{ length: pairs / pairsPerPixel },
		(_bucket, index) => buckets.find(({ fromPair }) => fromPair === index * pairsPerPixel)?.body,
	);
}

test('a bucket of several pairs folds their power, not their level', () => {
	const peaks = { fullScale: 128, rms: new Int8Array([0, 0, 0, 64, 0, 64]), samples: loud(6) };

	expect(bodies(peaks, 4, 4)).toEqual([{ high: 0.25, low: -0.25 }]);
	expect(bodies(peaks, 2, 6)[2]).toEqual({ high: 0.25 * Math.SQRT2, low: -0.25 * Math.SQRT2 });
});

test.each<[string, Pick<WaveformPeaks, 'fullScale' | 'rms' | 'samples'>]>([
	['8-bit', { rms: new Int8Array([64]), samples: loud(1) }],
	['16-bit', { rms: new Int16Array([16_384]), samples: new Int16Array([-32_768, 32_767]) }],
	['float', { rms: new Float32Array([0.5]), samples: new Float32Array([-1, 1]) }],
	[
		'float with a full scale',
		{ fullScale: 2, rms: new Float32Array([1]), samples: new Float32Array([-2, 2]) },
	],
	[
		'8-bit with a full scale',
		{ fullScale: 64, rms: new Int8Array([32]), samples: new Int8Array([-64, 64]) },
	],
])('%s RMS reads on the scale of its samples', (_name, peaks) => {
	expect(bodies(peaks, 1, 1)).toEqual([{ high: 0.5, low: -0.5 }]);
});

test('with two channels the RMS stays one value a pair', () => {
	const peaks = { channels: 2, rms: new Int8Array([64, 32, 16]), samples: loud(3, 2) };

	expect(bodies(peaks, 1, 3)).toEqual([
		{ high: 0.5, low: -0.5 },
		{ high: 0.25, low: -0.25 },
		{ high: 0.125, low: -0.125 },
	]);
});

test('silence has a body of nothing, while pairs past a short RMS, or no RMS, have no body', () => {
	const short = { rms: new Int8Array([0, 64, 64]), samples: loud(6) };

	expect(bodies(short, 1, 6)).toEqual([
		{ high: 0, low: -0 },
		{ high: 0.5, low: -0.5 },
		{ high: 0.5, low: -0.5 },
		undefined,
		undefined,
		undefined,
	]);
	const [opening, ...rest] = bodies(short, 2, 6) as Array<undefined | { high: number }>;

	expect(opening?.high).toBeCloseTo(0.5 / Math.SQRT2, 12);
	expect(rest).toEqual([undefined, undefined]);
	expect(bodies({ samples: loud(2) }, 1, 2)).toEqual([undefined, undefined]);
});

test('a bucket across the end of two-channel peaks folds the RMS of the pairs that exist', () => {
	const peaks = { channels: 2, rms: new Int8Array([0, 0, 64]), samples: loud(3, 2) };

	expect(bodies(peaks, 2, 4)[1]).toEqual({ high: 0.5, low: -0.5 });
});

test('an RMS above its peaks is held to them on each side', () => {
	const peaks = { rms: new Int8Array([64]), samples: new Int8Array([-16, 32]) };

	expect(bodies(peaks, 1, 1)).toEqual([{ high: 0.25, low: -0.125 }]);
});

const pairCount = 24;

test.prop([
	fc.record({
		channels: fc.constantFrom(1, 2),
		extremes: fc.array(fc.integer({ max: 127, min: -128 }), {
			maxLength: pairCount * 4,
			minLength: pairCount * 4,
		}),
		levels: fc.array(fc.integer({ max: 127, min: 0 }), {
			maxLength: pairCount,
			minLength: pairCount,
		}),
		pairsPerPixel: fc.constantFrom(1, 3, 4),
	}),
])(
	'a body sits inside its peaks, and within the RMS of its own pairs',
	({ channels, extremes, levels, pairsPerPixel }) => {
		const samples = Int8Array.from(extremes.slice(0, pairCount * channels * 2));
		const peaks = {
			channels,
			fullScale: 128,
			pairsPerSecond,
			rms: Int8Array.from(levels),
			samples,
		};
		const buckets = waveformBuckets(peaks, {
			pixelsPerSecond: pairsPerSecond / pairsPerPixel,
			startSeconds: 0,
			width: pairCount / pairsPerPixel,
		});

		for (const { body, fromPair, high, low, toPair } of buckets) {
			if (fromPair < 0 || toPair > pairCount) {
				expect(body).toBeUndefined();
				continue;
			}

			const own = levels.slice(fromPair, toPair);
			const [quietest, loudest] = [Math.min(...own) / 128, Math.max(...own) / 128];

			assert(body);
			expect(body.low).toBeGreaterThanOrEqual(low);
			expect(body.high).toBeLessThanOrEqual(high);
			expect(body.high).toBeLessThanOrEqual(loudest + 1e-12);
			expect(body.high).toBeGreaterThanOrEqual(Math.min(high, quietest) - 1e-12);
			expect(body.low).toBeLessThanOrEqual(-Math.min(-low, quietest) + 1e-12);
		}
	},
);
