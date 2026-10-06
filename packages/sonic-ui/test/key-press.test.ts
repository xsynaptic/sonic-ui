import { afterEach, expect, test } from 'vitest';

import { bindKeyPress } from '#lib/key-press.ts';

const binding = { controller: new AbortController() };

afterEach(() => {
	binding.controller.abort();
	binding.controller = new AbortController();
	document.body.replaceChildren();
});

function mount(): [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement] {
	document.body.innerHTML =
		'<div><button type="button"></button><button type="button"></button><button disabled type="button"></button></div>';

	const root = document.querySelector('div');
	const [first, second, disabled] = document.querySelectorAll('button');
	if (!root || !first || !second || !disabled) throw new Error('No buttons');

	bindKeyPress(root, binding.controller.signal);
	first.focus();

	return [first, second, disabled];
}

function key(target: HTMLElement, type: 'keydown' | 'keyup', init: KeyboardEventInit): void {
	target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }));
}

function isHeld(part: HTMLElement): boolean {
	return 'sonicPressed' in part.dataset;
}

test('Space marks the part until it lifts, and a repeat after that marks nothing', () => {
	const [first] = mount();

	key(first, 'keydown', { key: ' ' });
	expect(isHeld(first)).toBe(true);

	key(first, 'keyup', { key: 'a' });
	expect(isHeld(first)).toBe(true);

	key(first, 'keyup', { key: ' ' });
	expect(isHeld(first)).toBe(false);

	key(first, 'keydown', { key: ' ', repeat: true });
	expect(isHeld(first)).toBe(false);
});

test('Enter, a key already handled and a disabled part mark nothing', () => {
	const [first, , disabled] = mount();

	key(first, 'keydown', { key: 'Enter' });
	expect(isHeld(first)).toBe(false);

	first.addEventListener(
		'keydown',
		(event) => {
			event.preventDefault();
		},
		{ once: true },
	);
	key(first, 'keydown', { key: ' ' });
	expect(isHeld(first)).toBe(false);

	key(disabled, 'keydown', { key: ' ' });
	expect(isHeld(disabled)).toBe(false);
});

test('focus moving to a sibling lets go, and a Space lifted there leaves the sibling alone', () => {
	const [first, second] = mount();

	key(first, 'keydown', { key: ' ' });
	second.focus();
	expect(isHeld(first)).toBe(false);

	key(second, 'keyup', { key: ' ' });
	expect(isHeld(second)).toBe(false);
});

test('a Meta lifted mid-hold lets go, and so does unbinding', () => {
	const [first] = mount();

	key(first, 'keydown', { key: ' ' });
	key(first, 'keyup', { key: 'Meta' });
	expect(isHeld(first)).toBe(false);

	key(first, 'keydown', { key: ' ' });
	binding.controller.abort();
	expect(isHeld(first)).toBe(false);
});
