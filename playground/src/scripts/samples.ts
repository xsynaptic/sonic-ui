import type { SonicWaveform } from '@xsynaptic/sonic-ui';

import { frameLoop } from '#scripts/frame-loop.ts';
import { readRegions } from '#scripts/read-regions.ts';
import { seededPeaks } from '#scripts/seeded-peaks.ts';
import { emptySamples, fillSamples, pairsPerSecond } from '#scripts/seeded-samples.ts';

function play(waveform: SonicWaveform): void {
	let position = waveform.value;
	let reported = 0;

	waveform.readTime = () => position;
	waveform.addEventListener('change', () => {
		position = waveform.value;
	});
	frameLoop((elapsedSeconds, time) => {
		position += elapsedSeconds * waveform.playbackRate;
		if (position >= waveform.max) position = waveform.min;
		if (time - reported < 250) return;

		reported = time;
		waveform.value = position;
	}).start();
}

for (const waveform of document.querySelectorAll<SonicWaveform>('sonic-waveform[data-samples]')) {
	const samples = emptySamples(waveform.max);
	const peaks = seededPeaks(Number(waveform.dataset.samples));
	const pending = readRegions(waveform.dataset.pending);
	let from = 0;

	for (const [start, end] of [...pending, [waveform.max, waveform.max] as const]) {
		fillSamples(samples, peaks, [from, Math.floor(start * pairsPerSecond)]);
		from = Math.ceil(end * pairsPerSecond);
	}
	waveform.peaks = { pairsPerSecond, samples };
	waveform.pending = pending;
	if (waveform.playing) play(waveform);
}
