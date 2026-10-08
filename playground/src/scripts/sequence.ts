import { getTransport } from '#scripts/tone.ts';

export type Stem = (sixteenth: number, time: number) => void;

const sixteenthsPerBeat = 4;

export function stemOf<Hit>(
	hits: ReadonlyMap<number, Hit>,
	play: (hit: Hit, time: number) => void,
): Stem {
	return (sixteenth, time) => {
		const hit = hits.get(sixteenth);

		if (hit !== undefined) play(hit, time);
	};
}

export function createSequence(stems: ReadonlyArray<Stem>, sixteenthsPerPhrase: number) {
	const transport = getTransport();
	const ticksPerSixteenth = transport.PPQ / sixteenthsPerBeat;

	transport.scheduleRepeat((time) => {
		const sixteenth = Math.round(transport.getTicksAtTime(time) / ticksPerSixteenth);

		for (const stem of stems) stem(sixteenth % sixteenthsPerPhrase, time);
	}, '16n');

	return {
		beatPhase: () =>
			(transport.getTicksAtTime(transport.immediate()) % transport.PPQ) / transport.PPQ,
		restart(): void {
			transport.ticks = 0;
		},
		setTempo(bpm: number): void {
			transport.bpm.value = bpm;
		},
		start(): void {
			transport.start();
		},
		stop(): void {
			transport.stop();
		},
	};
}
