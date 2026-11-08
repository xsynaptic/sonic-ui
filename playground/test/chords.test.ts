import { expect, test } from 'vitest';

import { chordName, chordNotes, chordSpelling } from '#scripts/synth/chords.ts';

test('a chord is its shape moved to the pressed note', () => {
	expect(chordNotes(57, 'minor', 'seventh')).toEqual([57, 60, 64, 67]);
	expect(chordNotes(50, 'sus4', 'ninth')).toEqual([50, 55, 57, 60, 64]);
});

test('a chord is spelled by interval from its root, on a black-key root as well', () => {
	expect(chordSpelling(60, 'minor', 'none')).toEqual(['C', 'E♭', 'G']);
	expect(chordSpelling(63, 'major', 'major7')).toEqual(['E♭', 'G', 'B♭', 'D']);
	expect(chordSpelling(66, 'major', 'seventh')).toEqual(['F♯', 'A♯', 'C♯', 'E']);
	expect(chordSpelling(68, 'augmented', 'none')).toEqual(['A♭', 'C', 'E']);
	expect(chordSpelling(61, 'minor', 'ninth')).toEqual(['D♭', 'F♭', 'A♭', 'C♭', 'E♭']);
	expect(chordSpelling(60, 'diminished', 'sixth')).toEqual(['C', 'E♭', 'G♭', 'B𝄫']);
});

test('a chord with a name of its own takes it, and sus4 goes last', () => {
	expect(chordName(62, 'diminished', 'sixth')).toBe('Ddim7');
	expect(chordName(71, 'diminished', 'seventh')).toBe('Bm7♭5');
	expect(chordName(57, 'minor', 'major7')).toBe('Am(maj7)');
	expect(chordName(55, 'sus4', 'seventh')).toBe('G7sus4');
	expect(chordName(70, 'minor', 'sixth')).toBe('B♭m6');
});
