// audiowaveform's defaults
export const pairsPerSecond = 44_100 / 256;

function grain(pair: number): number {
	const scrambled = Math.sin(pair * 12.9898) * 43_758.5453;

	return scrambled - Math.floor(scrambled);
}

export function fillSamples(
	{ rms, samples }: { rms?: Int8Array; samples: Int8Array },
	peaks: ArrayLike<number>,
	[fromPair, toPair]: [number, number],
): void {
	const pairs = samples.length / 2;

	for (let pair = Math.max(0, fromPair); pair < Math.min(pairs, toPair); pair += 1) {
		const level = peaks[Math.floor((pair / pairs) * peaks.length)] ?? 0;
		const phase = ((pair / pairsPerSecond) % 0.5) / 0.5;
		const amplitude = 127 * level * (1 - phase * 0.55) * (0.75 + 0.25 * grain(pair));

		samples[pair * 2] = -Math.round(amplitude * (0.85 + 0.15 * grain(pair + pairs)));
		samples[pair * 2 + 1] = Math.round(amplitude);
		if (rms) {
			rms[pair] = Math.round(
				127 * level * (1 - phase * 0.25) * 0.4 * (0.9 + 0.1 * grain(pair + pairs * 2)),
			);
		}
	}
}

export function emptySamples(seconds: number): Int8Array<ArrayBuffer> {
	return new Int8Array(Math.ceil(seconds * pairsPerSecond) * 2);
}

export function emptyRms(seconds: number): Int8Array<ArrayBuffer> {
	return new Int8Array(Math.ceil(seconds * pairsPerSecond));
}
