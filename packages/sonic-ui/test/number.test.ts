import { expect, test } from 'vitest';

import type { SonicNumber } from '#elements/number.ts';

import '#define/number.ts';

import { pressKey, recordEvents } from './helpers.ts';

function mountNumber(attributes: string): { control: HTMLElement; number: SonicNumber } {
	document.body.innerHTML = `<div><sonic-number ${attributes}></sonic-number></div>`;

	const number = document.querySelector('sonic-number');
	const control = number?.querySelector<HTMLElement>('.sonic-number');
	if (!number || !control) throw new Error('The number box did not render');

	return { control, number };
}

function partsOf(control: HTMLElement): { digits: HTMLElement; entry: HTMLInputElement } {
	const digits = control.querySelector<HTMLElement>('.sonic-number-value');
	const entry = control.querySelector('input');
	if (!digits || !entry) throw new Error('The number box is missing a part');

	return { digits, entry };
}

function pointerAt(control: HTMLElement, type: string, init: PointerEventInit): void {
	control.dispatchEvent(
		new PointerEvent(type, { bubbles: true, button: 0, clientX: 10, pointerId: 1, ...init }),
	);
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

// happy-dom computes no styles, so the box falls back to 160px of travel
test('a drag up raises the value over the travel, and Shift slows it tenfold', () => {
	const { control, number } = mountNumber('min="-20" max="140" step="0.5" value="0"');
	const events = recordEvents(document.body);

	pointerAt(control, 'pointerdown', { clientY: 100 });
	pointerAt(control, 'pointermove', { clientY: 60 });
	expect(number.value).toBe(40);

	pointerAt(control, 'pointermove', { clientY: 20, shiftKey: true });
	expect(number.value).toBe(44);

	pointerAt(control, 'pointerup', { clientY: 20 });
	expect(events).toEqual(['input', 'input', 'change']);
});

test('a double press types in place with no popover, and Enter commits', () => {
	const { control, number } = mountNumber('aria-label="Tempo" min="20" max="300" value="120"');
	const { digits, entry } = partsOf(control);
	const events = recordEvents(document.body);

	expect(control.querySelector('[popover]')).toBeNull();

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
