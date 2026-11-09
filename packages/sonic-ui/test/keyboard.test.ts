import { afterEach, expect, test, vi } from 'vitest';

import type { SonicKeyboard } from '#elements/keyboard.ts';

import '#define/keyboard.ts';

import { mountControl, pointerAt, pressKey } from './helpers.ts';

const whiteSteps = [0, 2, 4, 5, 7, 9, 11];

let listening = new AbortController();

afterEach(() => {
	listening.abort();
	listening = new AbortController();
	vi.useRealTimers();
});

function recordNotes(target: HTMLElement): Array<string> {
	const notes: Array<string> = [];
	const { signal } = listening;

	target.addEventListener(
		'sonic-noteon',
		(event) => {
			notes.push(`on ${String(event.detail.note)}`);
		},
		{ signal },
	);
	target.addEventListener(
		'sonic-noteoff',
		(event) => {
			notes.push(`off ${String(event.detail.note)}`);
		},
		{ signal },
	);

	return notes;
}

function laidOut(attributes: string): {
	control: HTMLElement;
	key: (note: number) => HTMLButtonElement;
	keyboard: SonicKeyboard;
	notes: Array<string>;
} {
	const { control, host } = mountControl('sonic-keyboard', attributes);
	const lowest = Number(control.querySelector<HTMLElement>('[data-sonic-note]')?.dataset.sonicNote);

	for (const key of control.querySelectorAll<HTMLElement>('.sonic-keyboard-key')) {
		const note = Number(key.dataset.sonicNote);
		const octaveLeft = 70 * Math.floor((note - lowest) / 12);
		const step = note % 12;
		const white = whiteSteps.indexOf(step);
		const box =
			white === -1
				? new DOMRect(octaveLeft + (step * 70) / 12, 0, 70 / 12, 60)
				: new DOMRect(octaveLeft + white * 10, 0, 10, 100);

		key.getBoundingClientRect = () => box;
	}

	const notes = recordNotes(document.body);

	const key = (note: number): HTMLButtonElement => {
		const found = control.querySelector<HTMLButtonElement>(
			`[data-sonic-note="${CSS.escape(String(note))}"]`,
		);
		if (!found) throw new Error(`No key for ${String(note)}`);

		return found;
	};

	return { control, key, keyboard: host, notes };
}

test('a glissando lets go of each key before it plays the next', () => {
	const { control, key, notes } = laidOut('octave="2"');

	pointerAt(key(36), 'pointerdown', { clientX: 5, clientY: 90 });
	pointerAt(control, 'pointermove', { clientX: 15, clientY: 90 });
	pointerAt(control, 'pointermove', { clientX: 25, clientY: 90 });
	pointerAt(control, 'pointerup', { clientX: 25, clientY: 90 });

	expect(notes).toEqual(['on 36', 'off 36', 'on 38', 'off 38', 'on 40', 'off 40']);
});

test('a scroll mid-press moves the glissando with the keys from the next frame', () => {
	vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });

	const { control, key, notes } = laidOut('octave="2"');

	pointerAt(key(36), 'pointerdown', { clientX: 5, clientY: 90 });
	pointerAt(control, 'pointermove', { clientX: 6, clientY: 90 });
	control.getBoundingClientRect = () => new DOMRect(0, -100, 140, 100);
	vi.advanceTimersToNextFrame();
	pointerAt(control, 'pointermove', { clientX: 15, clientY: -10 });

	expect(notes).toEqual(['on 36', 'off 36', 'on 38']);
});

test('a black key wins over the white key under it', () => {
	const { control, key, notes } = laidOut('octave="3"');

	pointerAt(key(48), 'pointerdown', { clientX: 2, clientY: 30 });
	pointerAt(control, 'pointermove', { clientX: 8, clientY: 30 });
	pointerAt(control, 'pointermove', { clientX: 8, clientY: 80 });

	expect(notes).toEqual(['on 48', 'off 48', 'on 49', 'off 49', 'on 48']);
});

test('leaving the keys lets go, and coming back while down plays again', () => {
	const { control, key, notes } = laidOut('');

	pointerAt(key(60), 'pointerdown', { clientX: 2, clientY: 90 });
	pointerAt(control, 'pointermove', { clientX: 2, clientY: 140 });
	pointerAt(control, 'pointermove', { clientX: 2, clientY: 90 });

	expect(notes).toEqual(['on 60', 'off 60', 'on 60']);
});

test('two fingers on one key are one note', () => {
	const { control, key, notes } = laidOut('');

	pointerAt(key(64), 'pointerdown', { clientX: 25, clientY: 90, pointerId: 1 });
	pointerAt(key(64), 'pointerdown', { clientX: 26, clientY: 90, pointerId: 2 });
	pointerAt(control, 'pointerup', { pointerId: 1 });

	expect(notes).toEqual(['on 64']);
	expect(key(64).dataset.sonicPressed).toBe('');

	pointerAt(control, 'pointerup', { pointerId: 2 });

	expect(notes).toEqual(['on 64', 'off 64']);
	expect(key(64).dataset.sonicPressed).toBeUndefined();
});

test('a held note draws its key down without a sound, and a finger on it still plays', () => {
	const { control, key, keyboard, notes } = laidOut('octave="4" held="64"');

	keyboard.held = [64, 67];

	expect([...control.querySelectorAll('[data-sonic-pressed]')]).toEqual([key(64), key(67)]);

	pointerAt(key(64), 'pointerdown', { clientX: 25, clientY: 90 });
	pointerAt(control, 'pointerup');

	expect(notes).toEqual(['on 64', 'off 64']);
	expect(key(64).dataset.sonicPressed).toBe('');

	keyboard.held = undefined;

	expect(control.querySelector('[data-sonic-pressed]')).toBeNull();
	expect(notes).toEqual(['on 64', 'off 64']);
});

test('a finger and the computer keyboard on one key are one note', () => {
	const { control, key, notes } = laidOut('');

	key(60).focus();
	pressKey(key(60), ' ');
	pointerAt(key(60), 'pointerdown', { clientX: 2, clientY: 90 });
	key(60).dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
	pointerAt(control, 'pointerup');

	expect(notes).toEqual(['on 60', 'off 60']);
});

test('changing the octave or disabling the keys mid-press lets go of every note', () => {
	const { control, key, keyboard, notes } = laidOut('octave="1"');

	pointerAt(key(24), 'pointerdown', { clientX: 2, clientY: 90 });
	keyboard.octave = 2;
	pointerAt(control, 'pointermove', { clientX: 15, clientY: 90 });

	expect(notes).toEqual(['on 24', 'off 24']);

	key(36).focus();
	pressKey(key(36), 'Enter');
	keyboard.disabled = true;

	expect(notes).toEqual(['on 24', 'off 24', 'on 36', 'off 36']);
});

test('removing the keyboard lets go of a held note, heard only on the keyboard itself', async () => {
	const { key, keyboard } = laidOut('');
	const heard = recordNotes(keyboard);

	pointerAt(key(62), 'pointerdown', { clientX: 15, clientY: 90 });
	keyboard.remove();
	await Promise.resolve();
	await Promise.resolve();

	expect(heard).toEqual(['on 62', 'off 62']);
});

test('putting the keyboard straight back lets go of a press, and the off is heard outside', async () => {
	const { key, keyboard, notes } = laidOut('');

	pointerAt(key(62), 'pointerdown', { clientX: 15, clientY: 90 });
	document.body.append(keyboard);
	await Promise.resolve();
	await Promise.resolve();

	expect(notes).toEqual(['on 62', 'off 62']);
});

test('a cancelled press and a press whose capture is lost each let go', () => {
	const { control, key, notes } = laidOut('');

	pointerAt(key(60), 'pointerdown', { clientX: 2, clientY: 90, pointerId: 1 });
	pointerAt(key(64), 'pointerdown', { clientX: 25, clientY: 90, pointerId: 2 });
	pointerAt(control, 'pointercancel', { pointerId: 1 });
	pointerAt(control, 'lostpointercapture', { pointerId: 2 });

	expect(notes).toEqual(['on 60', 'on 64', 'off 60', 'off 64']);
});

test('a second press from the same pointer lets go of the first', () => {
	const { control, key, notes } = laidOut('');

	pointerAt(key(60), 'pointerdown', { clientX: 2, clientY: 90 });
	pointerAt(key(64), 'pointerdown', { clientX: 25, clientY: 90 });
	pointerAt(control, 'pointerup');

	expect(notes).toEqual(['on 60', 'off 60', 'on 64', 'off 64']);
});

test('a listener that moves the range during an on still lets every listener hear the on first', () => {
	const { key, keyboard, notes } = laidOut('');

	keyboard.addEventListener(
		'sonic-noteon',
		() => {
			keyboard.octave = 2;
		},
		{ signal: listening.signal },
	);
	pointerAt(key(60), 'pointerdown', { clientX: 2, clientY: 90 });

	expect(notes).toEqual(['on 60', 'off 60']);
});

test('Space plays while held and a held key never repeats', () => {
	const { key, notes } = laidOut('');

	key(60).focus();
	pressKey(key(60), ' ');
	key(60).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ', repeat: true }));

	expect(notes).toEqual(['on 60']);

	key(60).dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));

	expect(notes).toEqual(['on 60', 'off 60']);
});

test('a held Space keeps sounding while arrows move, and lets go when focus leaves the keys', () => {
	const { key, notes } = laidOut('');
	const outside = document.createElement('input');

	document.body.append(outside);
	key(60).focus();
	pressKey(key(60), ' ');
	pressKey(key(60), 'ArrowRight');
	pressKey(key(61), 'ArrowRight');

	expect(document.activeElement).toBe(key(62));
	expect(notes).toEqual(['on 60']);

	outside.focus();

	expect(notes).toEqual(['on 60', 'off 60']);
});

test('a click with no pointer or key behind it plays a short note, and a pointer click adds none', () => {
	vi.useFakeTimers();

	const { control, key, keyboard, notes } = laidOut('');

	key(62).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));

	expect(notes).toEqual(['on 62']);

	vi.advanceTimersByTime(250);

	expect(notes).toEqual(['on 62', 'off 62']);

	pointerAt(key(60), 'pointerdown', { clientX: 2, clientY: 90 });
	pointerAt(control, 'pointerup', { clientX: 2, clientY: 90 });
	key(60).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
	key(64).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
	keyboard.disabled = true;

	expect(notes).toEqual(['on 62', 'off 62', 'on 60', 'off 60', 'on 64', 'off 64']);
});

test('arrows move the one tab stop by a semitone or an octave, silently', () => {
	const { key, notes } = laidOut('octave="3" octaves="3"');

	key(48).focus();
	pressKey(key(48), 'ArrowRight');
	pressKey(key(49), 'ArrowUp');
	pressKey(key(61), 'ArrowUp');
	pressKey(key(73), 'ArrowUp');

	expect(document.activeElement).toBe(key(73));
	expect(notes).toEqual([]);

	const stops = [...document.querySelectorAll('[tabindex="0"]')];

	expect(stops).toEqual([key(73)]);

	pressKey(key(73), 'Home');

	expect(document.activeElement).toBe(key(48));
});

test('a keydown another handler took is left alone', () => {
	const { control, key, notes } = laidOut('');

	control.addEventListener(
		'keydown',
		(event) => {
			event.preventDefault();
		},
		{ capture: true },
	);
	key(60).focus();
	pressKey(key(60), 'ArrowRight');
	pressKey(key(60), ' ');

	expect(document.activeElement).toBe(key(60));
	expect(notes).toEqual([]);
});

test('an accented note is highlighted too, and a note outside the keys marks nothing', () => {
	const { control, key, keyboard } = laidOut('octave="4" octaves="1" highlighted="64  67,x 76"');

	keyboard.accented = new Set([60]);

	expect([...control.querySelectorAll('[data-sonic-highlighted]')]).toEqual([
		key(60),
		key(64),
		key(67),
	]);
	expect([...control.querySelectorAll('[data-sonic-accented]')]).toEqual([key(60)]);
});

test('a formatNote set after connect renames every key and the C labels', () => {
	const { control, key, keyboard } = laidOut('octave="0" octaves="2"');

	expect(key(13).getAttribute('aria-label')).toBe('C sharp 0');
	expect(key(24).dataset.sonicLabel).toBe('C1');

	keyboard.formatNote = (note) => `n${String(note)}`;

	const names = [...control.querySelectorAll('.sonic-keyboard-key')].map((each) =>
		each.getAttribute('aria-label'),
	);

	expect(names).toEqual(Array.from({ length: 24 }, (_name, index) => `n${String(12 + index)}`));
	expect(key(24).dataset.sonicLabel).toBe('n24');
	expect(key(25).dataset.sonicLabel).toBeUndefined();
});

test('a spoken name hears how a key is marked, and leaves the printed label alone', () => {
	const { key, keyboard } = laidOut('octave="4" octaves="1" highlighted="60 64" accented="60"');

	keyboard.formatSpokenNote = (note, mark) => `${String(note)} ${mark ?? 'plain'}`;

	expect([60, 62, 64].map((note) => key(note).getAttribute('aria-label'))).toEqual([
		'60 accented',
		'62 plain',
		'64 highlighted',
	]);
	expect(key(60).dataset.sonicLabel).toBe('C4');
});

test('the range is held inside C-1 to B8', () => {
	const { control, keyboard } = laidOut('octave="8" octaves="3"');
	const notes = [...control.querySelectorAll<HTMLElement>('[data-sonic-note]')].map((key) =>
		Number(key.dataset.sonicNote),
	);

	expect([notes[0], notes.at(-1)]).toEqual([84, 119]);
	expect(keyboard.octave).toBe(6);

	keyboard.octave = -4;

	expect(control.querySelector<HTMLElement>('[data-sonic-note]')?.dataset.sonicNote).toBe('0');
});
