import { expect, test } from 'vitest';

import type { SonicNumber } from '#elements/number.ts';

import '#define/number.ts';

import { mountControl, pointerAt, pressKey, recordEvents } from './helpers.ts';

function mountNumber(attributes: string): { control: HTMLElement; number: SonicNumber } {
	const { control, host } = mountControl('sonic-number', attributes);

	return { control, number: host };
}

function partsOf(control: HTMLElement): { digits: HTMLElement; entry: HTMLInputElement } {
	const digits = control.querySelector<HTMLElement>('.sonic-number-value');
	const entry = control.querySelector('input');
	if (!digits || !entry) throw new Error('The number box is missing a part');

	return { digits, entry };
}

function doublePress(control: HTMLElement): void {
	for (let index = 0; index < 2; index += 1) {
		pointerAt(control, 'pointerdown', { clientY: 10 });
		pointerAt(control, 'pointerup', { clientY: 10 });
	}
}

function typeKey(entry: HTMLInputElement, key: string): void {
	entry.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
}

test('it is a spinbutton with the stepped value and no orientation', () => {
	const { control } = mountNumber('min="-20" max="80" step="2.5" value="31"');

	expect(control.getAttribute('role')).toBe('spinbutton');
	expect(control.getAttribute('aria-valuemin')).toBe('-20');
	expect(control.getAttribute('aria-valuemax')).toBe('80');
	expect(control.getAttribute('aria-valuenow')).toBe('30');
	expect(control.hasAttribute('aria-orientation')).toBe(false);
});

test('the digits follow formatValue and the value', () => {
	const { control, number } = mountNumber('min="-20" max="80" step="2.5" value="30"');
	const { digits } = partsOf(control);

	expect(digits.textContent).toBe('30');

	number.formatValue = (value) => `${String(value)} Hz`;
	expect(digits.textContent).toBe('30 Hz');
	expect(control.getAttribute('aria-valuetext')).toBe('30 Hz');

	pressKey(control, 'ArrowUp');
	expect(digits.textContent).toBe('32.5 Hz');
});

test('a drag up raises the value over the travel, and Shift slows it tenfold', () => {
	const { control, number } = mountNumber('min="-20" max="300" step="0.5" value="0"');
	const events = recordEvents(document.body);

	pointerAt(control, 'pointerdown', { clientY: 100 });
	pointerAt(control, 'pointermove', { clientY: 60 });
	expect(number.value).toBe(80);

	pointerAt(control, 'pointermove', { clientY: 20, shiftKey: true });
	expect(number.value).toBe(88);

	pointerAt(control, 'pointerup', { clientY: 20 });
	expect(events).toEqual(['input', 'input', 'change']);
});

test('a double press types in place, and Enter commits', () => {
	const { control, number } = mountNumber('aria-label="Tempo" min="20" max="300" value="120"');
	const { digits, entry } = partsOf(control);
	const events = recordEvents(document.body);

	doublePress(control);
	expect(entry.hidden).toBe(false);
	expect(document.activeElement).toBe(entry);
	expect(entry.getAttribute('aria-label')).toBe('Tempo');
	expect(control.hasAttribute('role')).toBe(false);

	entry.value = '98';
	entry.dispatchEvent(new Event('input', { bubbles: true }));
	typeKey(entry, 'Enter');

	expect(number.value).toBe(98);
	expect(digits.textContent).toBe('98');
	expect(events).toEqual(['input', 'change']);
	expect(entry.hidden).toBe(true);
	expect(control.getAttribute('role')).toBe('spinbutton');
	expect(document.activeElement).toBe(control);
});

test('Escape closes the entry and keeps the value', () => {
	const { control, number } = mountNumber('value="40"');
	const { entry } = partsOf(control);
	const events = recordEvents(document.body);

	pressKey(control, 'Enter');
	entry.value = '75';
	typeKey(entry, 'Escape');

	expect(number.value).toBe(40);
	expect(events).toEqual([]);
	expect(entry.hidden).toBe(true);
});

function tap(control: HTMLElement): void {
	pointerAt(control, 'pointerdown', { clientY: 10 });
	pointerAt(control, 'pointerup', { clientY: 10 });
}

test('with press="step", each tap steps to the next position and wraps past the last', () => {
	const { control, number } = mountNumber('press="step" positions="1 2 4 8" value="4"');
	const events = recordEvents(document.body);
	const landed: Array<number> = [];

	for (let index = 0; index < 3; index += 1) {
		tap(control);
		landed.push(number.value);
	}

	expect(landed).toEqual([8, 1, 2]);
	expect(events).toEqual(['input', 'change', 'input', 'change', 'input', 'change']);
	expect(partsOf(control).entry.hidden).toBe(true);
});

test('with press="step" on a stepped range, a tap at the top wraps to the minimum', () => {
	const { control, number } = mountNumber(
		'press="step" min="-20" max="80" step="2.5" value="77.5"',
	);

	tap(control);
	expect(number.value).toBe(80);

	tap(control);
	expect(number.value).toBe(-20);
});

test('with press="step", a drag moves by the drag alone', () => {
	const { control, number } = mountNumber('press="step" min="10" max="330" step="2" value="50"');

	pointerAt(control, 'pointerdown', { clientY: 100 });
	pointerAt(control, 'pointermove', { clientY: 80 });
	pointerAt(control, 'pointerup', { clientY: 80 });

	expect(number.value).toBe(90);
});

test('without press, a tap leaves the value', () => {
	const { control, number } = mountNumber('positions="1 2 4 8" value="4"');

	tap(control);

	expect(number.value).toBe(4);
});

test('Enter that confirms a composition leaves the entry open, and the next Enter commits', () => {
	const { control, number } = mountNumber('value="40"');
	const { entry } = partsOf(control);

	pressKey(control, 'Enter');
	entry.value = '75';
	entry.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, isComposing: true, key: 'Enter' }),
	);
	expect(entry.hidden).toBe(false);
	expect(number.value).toBe(40);

	typeKey(entry, 'Enter');
	expect(number.value).toBe(75);
});

test("the inner field's own input and change never leave the control", () => {
	const { control } = mountNumber('value="40"');
	const { entry } = partsOf(control);
	const events = recordEvents(document.body);

	pressKey(control, 'Enter');
	entry.dispatchEvent(new Event('input', { bubbles: true }));
	entry.dispatchEvent(new Event('change', { bubbles: true }));

	expect(events).toEqual([]);
});
