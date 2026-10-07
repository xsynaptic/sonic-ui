import { afterEach, expect, test } from 'vitest';

import { focusByPointer } from '#lib/focus-by-pointer.ts';

afterEach(() => {
	document.body.replaceChildren();
});

function pressed(): HTMLElement {
	document.body.innerHTML = '<div tabindex="0"></div><button type="button"></button>';

	const target = document.querySelector('div');
	if (!target) throw new Error('No target');

	focusByPointer(target);

	return target;
}

function key(target: HTMLElement, init: KeyboardEventInit): void {
	target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
}

function isMarked(target: HTMLElement): boolean {
	return 'sonicPointerFocus' in target.dataset;
}

test('a press focuses and marks, and the first plain key clears the mark', () => {
	const target = pressed();

	expect(document.activeElement).toBe(target);
	expect(isMarked(target)).toBe(true);

	key(target, { key: 'Shift' });
	expect(isMarked(target)).toBe(true);

	key(target, { key: 'ArrowUp', shiftKey: true });
	expect(isMarked(target)).toBe(false);
});

test.each([
	{ ctrlKey: true, key: 'c' },
	{ key: 'r', metaKey: true },
	{ altKey: true, key: 'Tab' },
])('a shortcut leaves the mark: %o', (init) => {
	const target = pressed();

	key(target, init);

	expect(isMarked(target)).toBe(true);
});

test('a blur that leaves the target focused, as a window switch does, keeps the mark', () => {
	const target = pressed();

	target.dispatchEvent(new FocusEvent('blur'));
	expect(isMarked(target)).toBe(true);

	document.querySelector('button')?.focus();
	expect(isMarked(target)).toBe(false);
});
