import type { Stem } from '#scripts/sequence.ts';

import { createSequence, stemOf } from '#scripts/sequence.ts';
import {
	BiquadFilter,
	MembraneSynth,
	MonoSynth,
	NoiseSynth,
	Panner,
	PolySynth,
	Synth,
} from '#scripts/tone.ts';

const sixteenthsPerPhrase = 32;

const kickBySixteenth = new Map([
	[0, 1],
	[4, 1],
	[8, 1],
	[12, 1],
	[16, 1],
	[20, 1],
	[24, 1],
	[28, 1],
	[31, 0.5],
]);
const hatBySixteenth = new Map([
	[2, 1],
	[6, 1],
	[7, 0.35],
	[10, 1],
	[14, 1],
	[18, 1],
	[22, 1],
	[23, 0.35],
	[26, 1],
	[29, 0.35],
	[30, 1],
]);
const clapBySixteenth = new Map([
	[4, 1],
	[12, 1],
	[20, 1],
	[28, 1],
]);
const bassBySixteenth = new Map([
	[2, 'A1'],
	[5, 'A1'],
	[7, 'C2'],
	[10, 'A1'],
	[13, 'G1'],
	[15, 'A1'],
	[18, 'F1'],
	[21, 'F1'],
	[23, 'A1'],
	[26, 'G1'],
	[29, 'G1'],
	[31, 'B1'],
]);
const tonic = ['A3', 'C4', 'E4', 'G4'];
const sixth = ['F3', 'A3', 'C4', 'E4'];
const seventh = ['G3', 'B3', 'D4', 'E4'];
const chordBySixteenth = new Map([
	[2, { notes: tonic, velocity: 1 }],
	[6, { notes: tonic, velocity: 0.7 }],
	[10, { notes: tonic, velocity: 0.9 }],
	[14, { notes: tonic, velocity: 0.6 }],
	[18, { notes: sixth, velocity: 1 }],
	[22, { notes: sixth, velocity: 0.7 }],
	[26, { notes: seventh, velocity: 0.9 }],
	[30, { notes: seventh, velocity: 0.6 }],
]);

function createKick(channel: AudioNode): Array<Stem> {
	const kick = new MembraneSynth({
		envelope: { attack: 0.001, decay: 0.32, release: 0.1, sustain: 0 },
		octaves: 5,
		pitchDecay: 0.03,
		volume: -7,
	});

	kick.chain(new Panner(0), channel);

	return [
		stemOf(kickBySixteenth, (velocity, time) => {
			kick.triggerAttackRelease('A1', '8n', time, velocity);
		}),
	];
}

function createTops(channel: AudioNode): Array<Stem> {
	const hats = new NoiseSynth({
		envelope: { attack: 0.001, decay: 0.045, release: 0.02, sustain: 0 },
		volume: -8,
	});
	const clap = new NoiseSynth({
		envelope: { attack: 0.002, decay: 0.16, release: 0.05, sustain: 0 },
		volume: -1,
	});

	hats.chain(new BiquadFilter({ frequency: 8000, type: 'highpass' }), new Panner(0.3), channel);
	clap.chain(
		new BiquadFilter({ frequency: 1500, Q: 1.2, type: 'bandpass' }),
		new Panner(-0.15),
		channel,
	);

	return [
		stemOf(hatBySixteenth, (velocity, time) => {
			hats.triggerAttackRelease('32n', time, velocity);
		}),
		stemOf(clapBySixteenth, (velocity, time) => {
			clap.triggerAttackRelease('16n', time, velocity);
		}),
	];
}

function createBass(channel: AudioNode): Array<Stem> {
	const bass = new MonoSynth({
		envelope: { attack: 0.005, decay: 0.15, release: 0.08, sustain: 0.4 },
		filter: { Q: 2, rolloff: -24, type: 'lowpass' },
		filterEnvelope: {
			attack: 0.005,
			baseFrequency: 90,
			decay: 0.12,
			octaves: 3,
			release: 0.2,
			sustain: 0.25,
		},
		oscillator: { type: 'sawtooth' },
		volume: -10,
	});

	bass.chain(new Panner(0), channel);

	return [
		stemOf(bassBySixteenth, (note, time) => {
			bass.triggerAttackRelease(note, '16n', time);
		}),
	];
}

function createChords(channel: AudioNode): Array<Stem> {
	const chords = new PolySynth(Synth, {
		envelope: { attack: 0.005, decay: 0.18, release: 0.3, sustain: 0.15 },
		oscillator: { count: 3, spread: 22, type: 'fatsawtooth' },
		volume: -9,
	});

	chords.chain(
		new BiquadFilter({ frequency: 2400, Q: 1, type: 'lowpass' }),
		new Panner(-0.25),
		channel,
	);

	return [
		stemOf(chordBySixteenth, ({ notes, velocity }, time) => {
			chords.triggerAttackRelease(notes, '16n', time, velocity);
		}),
	];
}

const stemMakers = [createKick, createTops, createBass, createChords];

export function createStems(channels: ReadonlyArray<AudioNode>) {
	return createSequence(
		channels.flatMap((channel, index) => stemMakers[index]?.(channel) ?? []),
		sixteenthsPerPhrase,
	);
}
