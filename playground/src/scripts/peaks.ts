import type { SonicWavestrip } from '@xsynaptic/sonic-ui';

import { bandMedians, emptyLevels, fillLevels, minDecibels } from '#scripts/seeded-bands.ts';
import { seededPeaks } from '#scripts/seeded-peaks.ts';
import { percentileRange } from '#scripts/seeded-samples.ts';

const buckets = 400;

// Averages the bands into one byte per band per bucket, as a host's build does for an overview
function bucketBands(seconds: number, bandCount: number): Uint8Array {
	const levels = emptyLevels(seconds, bandCount);
	const frames = levels.length / bandCount;
	const reduced = new Uint8Array(buckets * bandCount);

	fillLevels(levels, bandCount, [0, frames]);
	for (let bucket = 0; bucket < buckets; bucket += 1) {
		const from = Math.floor((bucket * frames) / buckets);
		const to = Math.max(from + 1, Math.floor(((bucket + 1) * frames) / buckets));

		for (let band = 0; band < bandCount; band += 1) {
			let total = 0;

			for (let frame = from; frame < to; frame += 1) total += levels[frame * bandCount + band] ?? 0;
			reduced[bucket * bandCount + band] = Math.round(total / (to - from));
		}
	}

	return reduced;
}

for (const strip of document.querySelectorAll<SonicWavestrip>('sonic-wavestrip[data-peaks]')) {
	const { bands, peaks = '' } = strip.dataset;
	const values =
		peaks === 'flat' ? Array.from({ length: 64 }, () => 1) : seededPeaks(Number(peaks), buckets);

	strip.peaks = values;
	strip.peaksRange = percentileRange(values, 1);
	if (bands === undefined) continue;

	const bandCount = Number(bands);
	const levels = bucketBands(strip.max, bandCount);

	strip.bands = { bandCount, levels, medians: bandMedians(levels, bandCount), minDecibels };
}
