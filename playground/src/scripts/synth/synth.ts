import {
	SonicButton,
	SonicDial,
	SonicKeyboard,
	SonicNumber,
	SonicSegmented,
} from '@xsynaptic/sonic-ui';

import type { Voices } from '#scripts/synth/audio.ts';
import type { Extension, Triad } from '#scripts/synth/chords.ts';

import { readControls } from '#scripts/find.ts';
import { createVoices } from '#scripts/synth/audio.ts';
import {
	chordName,
	chordNotes,
	chordSpelling,
	extensions,
	noteName,
	triads,
} from '#scripts/synth/chords.ts';
import { createContext } from '#scripts/tone.ts';

const spec = {
	extension: SonicSegmented,
	keyboard: SonicKeyboard,
	name: HTMLElement,
	octave: SonicNumber,
	octaves: SonicNumber,
	single: SonicButton,
	spelling: HTMLElement,
	triad: SonicSegmented,
	volume: SonicDial,
};

function isTriad(name: string): name is Triad {
	return Object.hasOwn(triads, name);
}

function isExtension(name: string): name is Extension {
	return Object.hasOwn(extensions, name);
}

function bindSynth(root: HTMLElement): void {
	const controls = readControls(root, spec, (name) => `:scope [data-synth-${name}]`);
	const held = new Map<number, Array<number>>();
	let voices: undefined | Voices;
	let context: AudioContext | undefined;

	function start(): Voices {
		if (voices) return voices;

		context = createContext();
		voices = createVoices();
		voices.setVolume(controls.volume.value);

		return voices;
	}

	function chordOf(root: number): { name: string; notes: Array<number>; spelling: Array<string> } {
		const triad = controls.triad.value;
		const extension = controls.extension.value;
		if (controls.single.pressed || !isTriad(triad) || !isExtension(extension)) {
			return { name: noteName(root), notes: [root], spelling: [noteName(root)] };
		}

		return {
			name: chordName(root, triad, extension),
			notes: chordNotes(root, triad, extension),
			spelling: chordSpelling(root, triad, extension),
		};
	}

	function light(): void {
		const roots = [...held.keys()];

		controls.keyboard.held = [...held.values()].flat();
		controls.keyboard.litOk = roots;
		controls.keyboard.lit = [...held.values()].flatMap((notes) => notes.slice(1));
	}

	controls.keyboard.addEventListener('sonic-noteon', (event) => {
		const { note } = event.detail;
		const chord = chordOf(note);
		const sound = start();

		void context?.resume();
		held.set(note, chord.notes);
		sound.sound(chord.notes);
		controls.name.textContent = chord.name;
		controls.spelling.textContent = chord.spelling.join(' ');
		light();
	});
	controls.keyboard.addEventListener('sonic-noteoff', (event) => {
		const notes = held.get(event.detail.note);
		if (!notes) return;

		held.delete(event.detail.note);
		voices?.release(notes);
		light();
	});
	controls.octave.addEventListener('input', () => {
		controls.keyboard.octave = controls.octave.value;
	});
	controls.octaves.addEventListener('input', () => {
		controls.keyboard.octaves = controls.octaves.value;
		controls.octave.max = 9 - controls.octaves.value;
		controls.octave.value = controls.keyboard.octave;
	});
	controls.volume.addEventListener('input', () => {
		voices?.setVolume(controls.volume.value);
	});
}

for (const root of document.querySelectorAll<HTMLElement>('[data-synth]')) bindSynth(root);
