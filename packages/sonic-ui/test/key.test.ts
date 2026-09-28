import { expect, test } from 'vitest';

// @vitest-environment happy-dom
import type { SonicKey } from '#elements/key.ts';

import '#define/key.ts';

function mountKey(attributes: string): { button: HTMLButtonElement; key: SonicKey } {
	document.body.innerHTML = `<sonic-key ${attributes}><svg data-icon="parsed"></svg></sonic-key>`;

	const key = document.querySelector('sonic-key');
	const button = key?.querySelector('button');
	if (!key || !button) throw new Error('The key did not render');

	return { button, key };
}

test('parsed children and a child appended later both land in the cap', async () => {
	const { key } = mountKey('');
	const late = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

	key.append(late);
	await new Promise((resolve) => setTimeout(resolve, 0));

	const cap = key.querySelector('.sonic-key-cap');

	expect(key.querySelector('[data-icon="parsed"]')?.parentElement).toBe(cap);
	expect(late.parentElement).toBe(cap);
});

test('replacing the children swaps the icon and keeps the key', async () => {
	const { key } = mountKey('');

	key.textContent = 'Solo';
	await new Promise((resolve) => setTimeout(resolve, 0));

	const cap = key.querySelector('.sonic-key-cap');

	expect(key.querySelector(':scope > .sonic-key')).not.toBeNull();
	expect(cap?.textContent).toBe('Solo');
	expect(key.querySelector('[data-icon="parsed"]')).toBeNull();
});

test('a toggle key latches on each press and reports it as change', () => {
	const { button, key } = mountKey('toggle');
	let changes = 0;

	key.addEventListener('change', () => (changes += 1));

	button.click();
	expect(key.pressed).toBe(true);
	expect(button.getAttribute('aria-pressed')).toBe('true');

	button.click();
	expect(key.pressed).toBe(false);
	expect(button.getAttribute('aria-pressed')).toBe('false');
	expect(changes).toBe(2);
});

test('a plain key neither latches nor reports change', () => {
	const { button, key } = mountKey('');
	let changes = 0;

	key.addEventListener('change', () => (changes += 1));
	button.click();

	expect(key.pressed).toBe(false);
	expect(button.hasAttribute('aria-pressed')).toBe(false);
	expect(changes).toBe(0);
});

test.each(['aria-describedby', 'aria-label', 'aria-labelledby'])(
	'%s is forwarded to the button as it is added, changed and removed',
	(name) => {
		const { button, key } = mountKey(`${name}="first"`);

		expect(button.getAttribute(name)).toBe('first');

		key.setAttribute(name, 'second');
		expect(button.getAttribute(name)).toBe('second');

		key.removeAttribute(name);
		expect(button.hasAttribute(name)).toBe(false);
	},
);

test('disabled disables the button, so a toggle no longer latches', () => {
	const { button, key } = mountKey('disabled toggle');

	expect(button.disabled).toBe(true);

	button.click();
	expect(key.pressed).toBe(false);

	key.disabled = false;
	expect(button.disabled).toBe(false);
});

function holdTrace(key: SonicKey): Array<boolean> {
	const trace: Array<boolean> = [];

	key.addEventListener('change', () => {
		trace.push(key.pressed);
	});

	return trace;
}

function pointerOn(button: HTMLButtonElement, type: string, pointerId = 1): void {
	button.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId }));
}

function keyOn(button: HTMLButtonElement, type: string, init: KeyboardEventInit): void {
	button.dispatchEvent(new KeyboardEvent(type, { bubbles: true, ...init }));
}

test.each(['pointerup', 'pointercancel', 'lostpointercapture'])(
	'a momentary key is pressed from pointerdown until %s, with a change at each edge',
	(release) => {
		const { button, key } = mountKey('momentary');
		const trace = holdTrace(key);

		pointerOn(button, 'pointerdown');
		expect(key.pressed).toBe(true);

		pointerOn(button, release);
		expect(key.pressed).toBe(false);
		expect(trace).toEqual([true, false]);
		expect(button.hasAttribute('aria-pressed')).toBe(false);
	},
);

test.each([' ', 'Enter'])(
	'a momentary key is held by "%s" until its keyup, ignoring repeats',
	(name) => {
		const { button, key } = mountKey('momentary');
		const trace = holdTrace(key);

		keyOn(button, 'keydown', { key: name });
		keyOn(button, 'keydown', { key: name, repeat: true });
		keyOn(button, 'keydown', { key: name, repeat: true });
		keyOn(button, 'keyup', { key: name === ' ' ? 'Enter' : ' ' });
		expect(key.pressed).toBe(true);

		keyOn(button, 'keyup', { key: name });
		expect(key.pressed).toBe(false);
		expect(trace).toEqual([true, false]);
	},
);

test('a momentary key ignores another pointer while held and its click after release', () => {
	const { button, key } = mountKey('momentary');
	const trace = holdTrace(key);

	pointerOn(button, 'pointerdown', 1);
	pointerOn(button, 'pointerdown', 2);
	pointerOn(button, 'pointerup', 2);
	expect(key.pressed).toBe(true);

	pointerOn(button, 'pointerup', 1);
	button.click();
	expect(trace).toEqual([true, false]);
});

test('two momentary keys hold at once, and focus moving to the second keeps the first down', () => {
	document.body.innerHTML = '<sonic-key momentary></sonic-key><sonic-key momentary></sonic-key>';

	const [first, second] = document.querySelectorAll('sonic-key');
	const firstButton = first?.querySelector('button');
	const secondButton = second?.querySelector('button');
	if (!first || !second || !firstButton || !secondButton)
		throw new Error('The keys did not render');

	firstButton.focus();
	pointerOn(firstButton, 'pointerdown', 1);
	secondButton.focus();
	pointerOn(secondButton, 'pointerdown', 2);

	expect(first.pressed).toBe(true);
	expect(second.pressed).toBe(true);
});

test('blur releases a momentary key held from the keyboard', () => {
	const { button, key } = mountKey('momentary');
	const trace = holdTrace(key);

	button.focus();
	keyOn(button, 'keydown', { key: ' ' });
	button.blur();

	expect(key.pressed).toBe(false);
	expect(trace).toEqual([true, false]);
});

test('disconnecting releases a held momentary key', async () => {
	const { button, key } = mountKey('momentary');
	const trace = holdTrace(key);

	pointerOn(button, 'pointerdown');
	key.remove();
	await Promise.resolve();

	expect(key.pressed).toBe(false);
	expect(trace).toEqual([true, false]);
});

test('disabled releases a held momentary key and ignores the next press', () => {
	const { button, key } = mountKey('momentary');
	const trace = holdTrace(key);

	pointerOn(button, 'pointerdown');
	key.disabled = true;
	expect(key.pressed).toBe(false);

	pointerOn(button, 'pointerdown', 2);
	keyOn(button, 'keydown', { key: 'Enter' });
	expect(key.pressed).toBe(false);
	expect(trace).toEqual([true, false]);
});

test('toggle wins over momentary', () => {
	const { button, key } = mountKey('momentary toggle');

	pointerOn(button, 'pointerdown');
	pointerOn(button, 'pointerup');
	expect(key.pressed).toBe(false);

	button.click();
	expect(key.pressed).toBe(true);
	expect(button.getAttribute('aria-pressed')).toBe('true');
});
