import { expect, test } from 'vitest';

import type { SonicNumber } from '#elements/number.ts';

import '#define/dial.ts';
import '#define/number.ts';
import { nearestEntry, parseNumberList } from '#lib/number-list.ts';

import { mountDial, pressKey } from './helpers.ts';

const values = 'values="2, 0.25 4 1 0.5"';

test('the list reads back sorted, a value snaps to an entry, and the ends bound the range', () => {
	const { control, dial } = mountDial(`${values} value="2.9"`);

	expect(dial.value).toBe(2);
	expect(dial.values).toEqual([0.25, 0.5, 1, 2, 4]);
	expect(control.getAttribute('aria-valuemin')).toBe('0.25');
	expect(control.getAttribute('aria-valuemax')).toBe('4');
});

test('a list of fewer than two numbers is no list', () => {
	const { dial } = mountDial('values="5 x" value="37"');

	expect(dial.values).toBeUndefined();
	expect(dial.value).toBe(37);
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

test('a list drops its repeats, and one left with a single entry is no list', () => {
	expect(parseNumberList('3 1 3 2 1')).toEqual([1, 2, 3]);
	expect(parseNumberList('5 5, 5')).toBeUndefined();
});

// A step tie rounds up; whether a list tie should follow it is undecided
test('a value midway between two entries takes the lower', () => {
	expect(nearestEntry([0.25, 0.5, 1, 2, 4], 1.5)).toBe(1);
	expect(nearestEntry([0.25, 0.5, 1, 2, 4], 1.51)).toBe(2);
});
