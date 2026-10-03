import { expect, test } from 'vitest';

import type { SonicKey } from '#elements/key.ts';

import '#define/key.ts';

import { mountControl, nextTask } from './helpers.ts';

function mountKey(attributes: string): { button: HTMLButtonElement; key: SonicKey } {
	const { control, host } = mountControl('sonic-key', attributes, '<svg data-icon="parsed"></svg>');
	if (!(control instanceof HTMLButtonElement)) throw new Error('The key has no button');

	return { button: control, key: host };
}

test('parsed children and a child appended later are copied into the cap, and only the key renders', async () => {
	const { button, key } = mountKey('');
	const late = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

	late.dataset.icon = 'late';
	key.append(late);
	await nextTask();

	const cap = key.querySelector('.sonic-key-cap');
	const icons = [...(cap?.querySelectorAll<SVGElement>('[data-icon]') ?? [])];

	expect(icons.map((icon) => icon.dataset.icon)).toEqual(['parsed', 'late']);
	expect(key.querySelector(':scope > [data-icon="parsed"]')).not.toBeNull();
	expect(key.shadowRoot?.querySelector('slot')?.assignedNodes()).toEqual([button]);
});

test('editing a child on the host re-copies it into the cap', async () => {
	const { key } = mountKey('');
	const label = document.createTextNode('Play');

	key.append(label);
	await nextTask();
	label.data = 'Pause';
	await nextTask();

	expect(key.querySelector('.sonic-key-cap')?.textContent).toBe('Pause');
});

test('replacing the children swaps the icon and keeps the key', async () => {
	const { key } = mountKey('');

	key.textContent = 'Solo';
	await nextTask();

	const cap = key.querySelector('.sonic-key-cap');

	expect(key.querySelector(':scope > .sonic-key')).not.toBeNull();
	expect(cap?.textContent).toBe('Solo');
	expect(key.querySelector('[data-icon="parsed"]')).toBeNull();
});

test('a toggle key latches on each press and reports it as change', () => {
	const { button, key } = mountKey('toggle');
	let changes = 0;

	document.body.addEventListener('change', () => (changes += 1));

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

test('aria-label is forwarded to the button as it is added, changed and removed', () => {
	const { button, key } = mountKey('aria-label="first"');

	expect(button.getAttribute('aria-label')).toBe('first');

	key.setAttribute('aria-label', 'second');
	expect(button.getAttribute('aria-label')).toBe('second');

	key.removeAttribute('aria-label');
	expect(button.hasAttribute('aria-label')).toBe(false);
});

test('disabled disables the button, so a toggle no longer latches', () => {
	const { button, key } = mountKey('disabled toggle');

	expect(button.disabled).toBe(true);

	button.click();
	expect(key.pressed).toBe(false);

	key.disabled = false;
	expect(button.disabled).toBe(false);
});

function holdTrace(key: SonicKey, listener: EventTarget = document.body): Array<boolean> {
	const trace: Array<boolean> = [];

	listener.addEventListener('change', () => {
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

test('focus moving to another control releases a momentary key held from the keyboard', () => {
	const { button, key } = mountKey('momentary');
	const next = document.createElement('button');

	document.body.append(next);
	button.focus();
	keyOn(button, 'keydown', { key: ' ' });
	button.dispatchEvent(new FocusEvent('blur', { relatedTarget: next }));

	expect(key.pressed).toBe(false);
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
	const trace = holdTrace(key, key);

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

test('a secondary button does not hold a momentary key', () => {
	const { button, key } = mountKey('momentary');

	button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, pointerId: 1 }));

	expect(key.pressed).toBe(false);
});

test('naming a held momentary key keeps it held', () => {
	const { button, key } = mountKey('momentary');
	const trace = holdTrace(key);

	pointerOn(button, 'pointerdown');
	key.setAttribute('aria-label', 'Kick');

	expect(key.pressed).toBe(true);
	expect(trace).toEqual([true]);
});

test('a key re-appended after removal latches once per press', async () => {
	const { button, key } = mountKey('toggle');
	let changes = 0;

	key.remove();
	await Promise.resolve();
	document.body.append(key);
	key.addEventListener('change', () => (changes += 1));
	button.click();

	expect(key.pressed).toBe(true);
	expect(changes).toBe(1);
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

test('toggle set as a property latches the next press', () => {
	const { button, key } = mountKey('');

	key.toggle = true;
	expect(button.getAttribute('aria-pressed')).toBe('false');

	button.click();
	expect(key.pressed).toBe(true);

	key.toggle = false;
	expect(key.hasAttribute('toggle')).toBe(false);
	expect(button.hasAttribute('aria-pressed')).toBe(false);
});

test('focus() and blur() reach the button, and a disabled key takes no focus', () => {
	const { button, key } = mountKey('');

	key.focus();
	expect(document.activeElement).toBe(button);

	key.blur();
	expect(document.activeElement).toBe(document.body);

	key.disabled = true;
	key.focus();
	expect(document.activeElement).toBe(document.body);
});

test('an undefined from plain JavaScript clears pressed and disabled rather than toggling them', () => {
	const { button, key } = mountKey('disabled pressed toggle');

	Reflect.set(key, 'pressed', undefined);
	Reflect.set(key, 'disabled', undefined);
	expect(key.pressed).toBe(false);
	expect(button.getAttribute('aria-pressed')).toBe('false');
	expect(key.hasAttribute('pressed')).toBe(true);
	expect(key.hasAttribute('disabled')).toBe(false);
});

test('a press moves the live state and leaves the pressed attribute as the default', () => {
	const { button, key } = mountKey('pressed toggle');

	button.click();
	expect(key.pressed).toBe(false);
	expect(key.defaultPressed).toBe(true);
	expect(key.hasAttribute('pressed')).toBe(true);
});

test('writing the pressed attribute moves a key pressed by hand', () => {
	const { button, key } = mountKey('pressed toggle');

	button.click();
	key.setAttribute('pressed', '');
	expect(key.pressed).toBe(true);
	expect(button.getAttribute('aria-pressed')).toBe('true');

	button.click();
	button.click();
	key.removeAttribute('pressed');
	expect(key.pressed).toBe(false);
});

test('defaultPressed reflects, and moves the live state until a press', () => {
	const { button, key } = mountKey('toggle');

	key.defaultPressed = true;
	expect(key.hasAttribute('pressed')).toBe(true);
	expect(key.pressed).toBe(true);

	key.pressed = false;
	key.defaultPressed = false;
	key.defaultPressed = true;
	expect(key.hasAttribute('pressed')).toBe(true);
	expect(button.getAttribute('aria-pressed')).toBe('true');

	button.click();
	key.defaultPressed = false;
	expect(key.pressed).toBe(false);
	expect(key.hasAttribute('pressed')).toBe(false);
});

test('a default set before the tag upgrades lands before the live state', async () => {
	document.body.innerHTML = '<sonic-late-key toggle></sonic-late-key>';

	const late = document.querySelector<SonicKey>('sonic-late-key');
	if (!late) throw new Error('The element was not parsed');

	late.defaultPressed = true;
	late.pressed = false;

	const { SonicKey } = await import('#elements/key.ts');

	customElements.define('sonic-late-key', class extends SonicKey {});
	expect(late.hasAttribute('pressed')).toBe(true);
	expect(late.pressed).toBe(false);
});

test('busy marks the button busy and leaves the key pressable', () => {
	const { button, key } = mountKey('busy toggle');

	expect(button.getAttribute('aria-busy')).toBe('true');

	button.click();
	expect(key.pressed).toBe(true);

	key.busy = false;
	expect(button.hasAttribute('aria-busy')).toBe(false);
});

test('a soft-disabled key keeps its tab stop but swallows clicks and holds', () => {
	const { button, key } = mountKey('soft-disabled toggle');
	const heard: Array<string> = [];

	for (const type of ['click', 'change']) {
		key.addEventListener(type, () => {
			heard.push(type);
		});
	}

	expect(button.disabled).toBe(false);
	expect(button.getAttribute('aria-disabled')).toBe('true');

	button.click();
	expect(key.pressed).toBe(false);
	expect(heard).toEqual([]);

	key.softDisabled = false;
	button.click();
	expect(key.pressed).toBe(true);
	expect(heard).toEqual(['change', 'click']);
});

test('a soft-disabled momentary key does not hold', () => {
	const { button, key } = mountKey('soft-disabled momentary');

	button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));

	expect(key.pressed).toBe(false);
});

test('disabled wins over soft-disabled', () => {
	const { button } = mountKey('disabled soft-disabled');

	expect(button.disabled).toBe(true);
	expect(button.hasAttribute('aria-disabled')).toBe(false);
});

test('armed reflects both ways and is no state of the toggle', () => {
	const { button, key } = mountKey('toggle armed');

	expect(key.armed).toBe(true);
	expect(button.getAttribute('aria-pressed')).toBe('false');
	expect(key.pressed).toBe(false);

	key.armed = false;
	expect(key.hasAttribute('armed')).toBe(false);

	button.click();
	key.armed = true;
	expect(key.hasAttribute('armed')).toBe(true);
	expect(button.getAttribute('aria-pressed')).toBe('true');
});

test('a momentary key held under Meta releases when Meta lifts', () => {
	const { button, key } = mountKey('momentary');
	const trace = holdTrace(key);

	keyOn(button, 'keydown', { key: 'Meta', metaKey: true });
	keyOn(button, 'keydown', { key: 'Enter', metaKey: true });
	expect(key.pressed).toBe(true);

	keyOn(button, 'keyup', { key: 'Meta' });
	expect(key.pressed).toBe(false);
	expect(trace).toEqual([true, false]);
});

test('a Meta keyup leaves a momentary key held by a pointer alone', () => {
	const { button, key } = mountKey('momentary');

	pointerOn(button, 'pointerdown');
	keyOn(button, 'keyup', { key: 'Meta' });

	expect(key.pressed).toBe(true);
});
