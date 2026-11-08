import { Compressor, Gain, MonoSynth, PolySynth } from '#scripts/tone.ts';

export interface Voices {
	release: (notes: Array<number>) => void;
	setVolume: (decibels: number) => void;
	sound: (notes: Array<number>) => void;
}

function frequencyOf(note: number): number {
	return 440 * 2 ** ((note - 69) / 12);
}

export function createVoices(): Voices {
	const master = new Gain(0);
	const limiter = new Compressor({
		attack: 0.003,
		knee: 6,
		ratio: 12,
		release: 0.2,
		threshold: -12,
	});
	const synth = new PolySynth({
		maxPolyphony: 64,
		options: {
			envelope: { attack: 0.01, decay: 0.3, release: 0.8, sustain: 0.6 },
			filter: { Q: 1, rolloff: -24, type: 'lowpass' },
			filterEnvelope: {
				attack: 0.005,
				baseFrequency: 300,
				decay: 0.4,
				octaves: 3.5,
				release: 0.8,
				sustain: 0.35,
			},
			oscillator: { type: 'sawtooth' },
			volume: -14,
		},
		voice: MonoSynth,
	});
	const sounding = new Map<number, number>();

	synth.chain(limiter, master);
	master.toDestination();

	return {
		release(notes) {
			const ending = notes.filter((note) => {
				const count = (sounding.get(note) ?? 0) - 1;

				if (count > 0) sounding.set(note, count);
				else sounding.delete(note);

				return count === 0;
			});

			if (ending.length > 0) synth.triggerRelease(ending.map((note) => frequencyOf(note)));
		},
		setVolume(decibels) {
			master.gain.rampTo(decibels <= -60 ? 0 : 10 ** (decibels / 20), 0.05);
		},
		sound(notes) {
			const starting = notes.filter((note) => {
				const count = (sounding.get(note) ?? 0) + 1;

				sounding.set(note, count);

				return count === 1;
			});

			if (starting.length > 0) synth.triggerAttack(starting.map((note) => frequencyOf(note)));
		},
	};
}
