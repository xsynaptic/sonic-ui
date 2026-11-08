export const triads = {
	augmented: { label: 'Aug', offsets: [0, 4, 8], symbol: 'aug' },
	diminished: { label: 'Dim', offsets: [0, 3, 6], symbol: 'dim' },
	major: { label: 'Maj', offsets: [0, 4, 7], symbol: '' },
	minor: { label: 'Min', offsets: [0, 3, 7], symbol: 'm' },
	sus4: { label: 'Sus4', offsets: [0, 5, 7], symbol: 'sus4' },
} as const;

export const triadOrder = ['major', 'minor', 'diminished', 'augmented', 'sus4'] as const;

export const extensions = {
	major7: { label: 'Maj7', offsets: [11], symbol: 'maj7' },
	ninth: { label: '9', offsets: [10, 14], symbol: '9' },
	none: { label: 'None', offsets: [], symbol: '' },
	seventh: { label: '7', offsets: [10], symbol: '7' },
	sixth: { label: '6', offsets: [9], symbol: '6' },
} as const;

export const extensionOrder = ['none', 'sixth', 'seventh', 'major7', 'ninth'] as const;

export type Triad = keyof typeof triads;

export type Extension = keyof typeof extensions;

const ownNames: Partial<Record<`${Triad} ${Extension}`, string>> = {
	'augmented major7': 'maj7♯5',
	'diminished major7': 'dim(maj7)',
	'diminished seventh': 'm7♭5',
	'diminished sixth': 'dim7',
	'minor major7': 'm(maj7)',
};

const rootNames = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

const letterPitches = [0, 2, 4, 5, 7, 9, 11] as const;

const accidentals = new Map([
	[-2, '𝄫'],
	[-1, '♭'],
	[0, ''],
	[1, '♯'],
	[2, '𝄪'],
]);

const letterSteps = new Map([
	[0, 0],
	[3, 2],
	[4, 2],
	[5, 3],
	[6, 4],
	[7, 4],
	[8, 4],
	[9, 5],
	[10, 6],
	[11, 6],
	[14, 1],
]);

function pitchClass(note: number): number {
	return ((note % 12) + 12) % 12;
}

function isDiminishedSeventh(triad: Triad, extension: Extension, offset: number): boolean {
	return triad === 'diminished' && extension === 'sixth' && offset === 9;
}

function chordOffsets(triad: Triad, extension: Extension): Array<number> {
	return [...triads[triad].offsets, ...extensions[extension].offsets];
}

export function chordNotes(root: number, triad: Triad, extension: Extension): Array<number> {
	return chordOffsets(triad, extension).map((offset) => root + offset);
}

export function chordName(root: number, triad: Triad, extension: Extension): string {
	const rootName = rootNames[pitchClass(root)] ?? '';
	const own = ownNames[`${triad} ${extension}`];
	if (own !== undefined) return `${rootName}${own}`;
	if (triad === 'sus4') return `${rootName}${extensions[extension].symbol}sus4`;

	return `${rootName}${triads[triad].symbol}${extensions[extension].symbol}`;
}

export function chordSpelling(root: number, triad: Triad, extension: Extension): Array<string> {
	const rootPitch = pitchClass(root);
	const rootLetter = letters.findIndex((letter) => letter === rootNames[rootPitch]?.charAt(0));

	return chordOffsets(triad, extension).map((offset) => {
		const steps = isDiminishedSeventh(triad, extension, offset)
			? 6
			: (letterSteps.get(offset) ?? 0);
		const letter = (rootLetter + steps) % 7;
		const natural = letterPitches[letter] ?? 0;
		const shift = ((pitchClass(rootPitch + offset) - natural + 18) % 12) - 6;

		return `${letters[letter] ?? ''}${accidentals.get(shift) ?? ''}`;
	});
}

export function noteName(note: number): string {
	return `${rootNames[pitchClass(note)] ?? ''}${String(Math.floor(note / 12) - 1)}`;
}
