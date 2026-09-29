import { expect, test } from 'vitest';

import type { SonicNumber } from '#elements/number.ts';

import '#define/dial.ts';
import '#define/number.ts';

import { mountDial, pressKey, recordEvents } from './helpers.ts';

// Unsorted and uneven on purpose; sorted, they sit a quarter of the travel apart
const values = 'values="2, 0.25 4 1 0.5"';

test('a value snaps to the nearest entry, and the ends bound the range', () => {
	const { control, dial } = mountDial(`${values} value="2.9"`);

	expect(dial.value).toBe(2);
	expect(dial.values).toEqual([0.25, 0.5, 1, 2, 4]);
	expect(control.getAttribute('aria-valuemin')).toBe('0.25');
	expect(control.getAttribute('aria-valuemax')).toBe('4');

	dial.value = 3.1;
	expect(dial.value).toBe(4);
});

test('a list of fewer than two numbers is no list', () => {
	const { dial } = mountDial('values="5 x" value="37"');

	expect(dial.values).toBeUndefined();
	expect(dial.value).toBe(37);
});

test.each([
	['ArrowUp', 1, 2],
	['ArrowDown', 1, 0.5],
	['PageUp', 1, 4],
	['PageDown', 2, 0.25],
	['Home', 2, 0.25],
	['End', 0.5, 4],
])('%s from %f moves to %f, one entry per step', (key, from, expected) => {
	const { control, dial } = mountDial(`${values} value="${String(from)}"`);

	pressKey(control, key);

	expect(dial.value).toBe(expected);
});

test('the last entry holds against a further step', () => {
	const { control, dial } = mountDial(`${values} value="4"`);
	const events = recordEvents(dial);

	pressKey(control, 'ArrowUp');

	expect(dial.value).toBe(4);
	expect(events).toEqual([]);
});

// 160px of travel over five entries puts one every 40px
test('a drag moves by entries evenly along the travel', () => {
	const { control, dial } = mountDial(`${values} value="0.5"`);
	const pointer = { bubbles: true, button: 0, pointerId: 1 };

	control.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientY: 200 }));
	control.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientY: 160 }));
	expect(dial.value).toBe(1);

	control.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientY: 130 }));
	expect(dial.value).toBe(2);
});

test('a notched dial marks each entry, and an origin between entries sits between their places', () => {
	const { control } = mountDial(`${values} notched origin="1.5" value="1"`);

	expect(control.style.getPropertyValue('--_sonic-dial-positions')).toBe('5');
	expect(control.style.getPropertyValue('--_sonic-dial-origin')).toBe('0.625');
	expect(control.style.getPropertyValue('--_sonic-dial-value')).toBe('0.5');
});

test('a number box steps through its entries and a typed value snaps to the nearest', () => {
	document.body.innerHTML = `<div><sonic-number ${values} value="1"></sonic-number></div>`;

	const number = document.querySelector<SonicNumber>('sonic-number');
	const control = number?.querySelector<HTMLElement>('.sonic-number');
	const entry = control?.querySelector('input');
	if (!number || !control || !entry) throw new Error('The number box did not render');

	number.formatValue = (value) => (value < 1 ? `1/${String(1 / value)}` : String(value));
	pressKey(control, 'ArrowDown');
	expect(control.querySelector('.sonic-number-value')?.textContent).toBe('1/2');

	pressKey(control, 'Enter');
	entry.value = '3.1';
	entry.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
	expect(number.value).toBe(4);
});
