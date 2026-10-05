import type { SonicSpectrum } from '@xsynaptic/sonic-ui';

import { frameLoop } from '#scripts/frame-loop.ts';

const binCount = 1024;
const nyquist = 24_000;

function spikeFrame(bin: number): Float32Array {
	const frame = new Float32Array(binCount).fill(-60);

	frame[bin] = -6;

	return frame;
}

function shapedFrame(seed: number): Float32Array {
	const fundamental = 110 * seed;

	return Float32Array.from({ length: binCount }, (_level, bin) => {
		const hertz = Math.max(1, (bin * nyquist) / binCount);
		const slope = -24 - 5 * Math.log2(hertz / 100);
		const wobble = 5 * Math.sin(bin * 0.9 + seed) * Math.sin(bin * 0.23 + seed * 2);
		const harmonic = Math.round(hertz / fundamental);
		const offset = Math.abs(hertz - harmonic * fundamental) / (nyquist / binCount);
		const isRinging = harmonic >= 1 && harmonic <= 3 && offset < 1;

		return isRinging ? 4 - harmonic * 6 : slope + wobble;
	});
}

function frameFor(spectrum: SonicSpectrum): Float32Array | undefined {
	const { spectrumShape, spectrumSpike } = spectrum.dataset;

	if (spectrumSpike !== undefined) return spikeFrame(Number(spectrumSpike));

	return spectrumShape === undefined ? undefined : shapedFrame(Number(spectrumShape));
}

const stills = [...document.querySelectorAll<SonicSpectrum>('sonic-spectrum')].flatMap(
	(spectrum) => {
		const frame = frameFor(spectrum);

		return frame ? [{ frame, spectrum }] : [];
	},
);

// A frame falls once received, so a still one is pushed again every frame
if (stills.length > 0) {
	frameLoop(() => {
		for (const { frame, spectrum } of stills) spectrum.push(frame);
	}).start();
}
