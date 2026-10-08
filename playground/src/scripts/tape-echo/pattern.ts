import type { Stem } from '#scripts/sequence.ts';

import { createSequence, stemOf } from '#scripts/sequence.ts';
import { BiquadFilter, MembraneSynth, NoiseSynth, PolySynth, Synth } from '#scripts/tone.ts';

const sixteenthsPerPhrase = 32;

const kickBySixteenth = new Map([
	[0, 1],
	[4, 0.9],
	[8, 1],
	[12, 0.9],
	[16, 1],
	[20, 0.9],
	[24, 1],
	[28, 0.9],
]);
const hatBySixteenth = new Map([
	[2, 0.8],
	[6, 0.5],
	[10, 0.8],
	[14, 0.5],
	[18, 0.8],
	[22, 0.5],
	[26, 0.8],
	[30, 0.6],
	[31, 0.3],
]);
const bassBySixteenth = new Map([
	[3, 'A1'],
	[11, 'A1'],
	[19, 'A1'],
	[26, 'G1'],
]);
const stab = ['C4', 'E4', 'G4', 'B4'];
const turn = ['C4', 'D4', 'F4', 'A4'];
const chordBySixteenth = new Map([
	[2, { notes: stab, velocity: 1 }],
	[9, { notes: stab, velocity: 0.6 }],
	[18, { notes: stab, velocity: 0.9 }],
	[27, { notes: turn, velocity: 0.7 }],
]);

function createKick(destination: AudioNode): Stem {
	const kick = new MembraneSynth({
		envelope: { attack: 0.001, decay: 0.28, release: 0.1, sustain: 0 },
		octaves: 4,
		pitchDecay: 0.04,
		volume: -11,
	});

	kick.connect(destination);

	return stemOf(kickBySixteenth, (velocity, time) => {
		kick.triggerAttackRelease('A1', '8n', time, velocity);
	});
}

function createHats(destination: AudioNode): Stem {
	const hats = new NoiseSynth({
		envelope: { attack: 0.001, decay: 0.05, release: 0.02, sustain: 0 },
		volume: -20,
	});

	hats.chain(new BiquadFilter({ frequency: 7000, type: 'highpass' }), destination);

	return stemOf(hatBySixteenth, (velocity, time) => {
		hats.triggerAttackRelease('32n', time, velocity);
	});
}

function createBass(destination: AudioNode): Stem {
	const bass = new Synth({
		envelope: { attack: 0.01, decay: 0.2, release: 0.15, sustain: 0.5 },
		oscillator: { type: 'triangle' },
		volume: -13,
	});

	bass.connect(destination);

	return stemOf(bassBySixteenth, (note, time) => {
		bass.triggerAttackRelease(note, '8n', time);
	});
}

function createChords(destination: AudioNode): Stem {
	const chords = new PolySynth(Synth, {
		envelope: { attack: 0.004, decay: 0.22, release: 0.25, sustain: 0 },
		oscillator: { count: 3, spread: 18, type: 'fatsawtooth' },
		volume: -19,
	});

	chords.chain(new BiquadFilter({ frequency: 1100, Q: 2.5, type: 'lowpass' }), destination);

	return stemOf(chordBySixteenth, ({ notes, velocity }, time) => {
		chords.triggerAttackRelease(notes, '16n', time, velocity);
	});
}

export function createPattern(destination: AudioNode) {
	return createSequence(
		[
			createKick(destination),
			createHats(destination),
			createBass(destination),
			createChords(destination),
		],
		sixteenthsPerPhrase,
	);
}
