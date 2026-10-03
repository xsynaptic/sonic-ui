import { readDatHeader } from '@xsynaptic/sonic-ui/dat';

// audiowaveform's default in platform byte order: version 1, 8-bit, 44.1 kHz at 256 samples a pixel
export const seededHeader = readDatHeader(Uint32Array.of(1, 1, 44_100, 256, 0).buffer);

export const { pairsPerSecond } = seededHeader;

function grain(pair: number): number {
	const scrambled = Math.sin(pair * 12.9898) * 43_758.5453;

	return scrambled - Math.floor(scrambled);
}

export function fillSamples(
	samples: Int8Array,
	peaks: ArrayLike<number>,
	[fromPair, toPair]: [number, number],
): void {
	const pairs = samples.length / 2;

	for (let pair = Math.max(0, fromPair); pair < Math.min(pairs, toPair); pair += 1) {
		const level = peaks[Math.floor((pair / pairs) * peaks.length)] ?? 0;
		const beat = 1 - (((pair / pairsPerSecond) % 0.5) / 0.5) * 0.55;
		const amplitude = 127 * level * beat * (0.75 + 0.25 * grain(pair));

		samples[pair * 2] = -Math.round(amplitude * (0.85 + 0.15 * grain(pair + pairs)));
		samples[pair * 2 + 1] = Math.round(amplitude);
	}
}

export function emptySamples(seconds: number): Int8Array<ArrayBuffer> {
	return new Int8Array(Math.ceil(seconds * pairsPerSecond) * 2);
}
