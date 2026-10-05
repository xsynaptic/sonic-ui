import { expect, test } from 'vitest';

import type { SonicButton } from '#elements/button.ts';

import '#define/button.ts';

import { mountControl, nextTask } from './helpers.ts';

function mountButton(attributes: string): { button: HTMLButtonElement; host: SonicButton } {
	const { control, host } = mountControl(
		'sonic-button',
		attributes,
		'<svg data-icon="parsed"></svg>',
	);
	if (!(control instanceof HTMLButtonElement)) throw new Error('The control has no native button');

	return { button: control, host };
}

test('parsed children and a child appended later are copied into the cap, and only the button renders', async () => {
	const { button, host } = mountButton('');
	const late = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

	late.dataset.icon = 'late';
	host.append(late);
	await nextTask();

	const cap = host.querySelector('.sonic-button-cap');
	const icons = [...(cap?.querySelectorAll<SVGElement>('[data-icon]') ?? [])];

	expect(icons.map((icon) => icon.dataset.icon)).toEqual(['parsed', 'late']);
	expect(host.querySelector(':scope > [data-icon="parsed"]')).not.toBeNull();
	expect(host.shadowRoot?.querySelector('slot')?.assignedNodes()).toEqual([button]);
});

test('editing a child on the host re-copies it into the cap', async () => {
	const { host } = mountButton('');
	const label = document.createTextNode('Play');

	host.append(label);
	await nextTask();
	label.data = 'Pause';
	await nextTask();

	expect(host.querySelector('.sonic-button-cap')?.textContent).toBe('Pause');
});

test('replacing the children swaps the icon and keeps the button', async () => {
	const { host } = mountButton('');

	host.textContent = 'Solo';
	await nextTask();

	const cap = host.querySelector('.sonic-button-cap');

	expect(host.querySelector(':scope > .sonic-button')).not.toBeNull();
	expect(cap?.textContent).toBe('Solo');
	expect(host.querySelector('[data-icon="parsed"]')).toBeNull();
});

test('a latching button latches on each press and reports it as change', () => {
	const { button, host } = mountButton('latching');
	let changes = 0;

	document.body.addEventListener('change', () => (changes += 1));

	button.click();
	expect(host.pressed).toBe(true);
	expect(button.getAttribute('aria-pressed')).toBe('true');

	button.click();
	expect(host.pressed).toBe(false);
	expect(button.getAttribute('aria-pressed')).toBe('false');
	expect(changes).toBe(2);
});

test('a plain button neither latches nor reports change', () => {
	const { button, host } = mountButton('');
	let changes = 0;

	host.addEventListener('change', () => (changes += 1));
	button.click();

	expect(host.pressed).toBe(false);
	expect(button.hasAttribute('aria-pressed')).toBe(false);
	expect(changes).toBe(0);
});

test('the host names the native button, and disabled disables it', () => {
	const { button, host } = mountButton('disabled latching aria-label="first"');

	expect(button.getAttribute('aria-label')).toBe('first');
	expect(button.disabled).toBe(true);

	host.disabled = false;
	expect(button.disabled).toBe(false);
});

function holdTrace(host: SonicButton, listener: EventTarget = document.body): Array<boolean> {
	const trace: Array<boolean> = [];

	listener.addEventListener('change', () => {
		trace.push(host.pressed);
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
	'a momentary button is pressed from pointerdown until %s, with a change at each edge',
	(release) => {
		const { button, host } = mountButton('momentary');
		const trace = holdTrace(host);

		pointerOn(button, 'pointerdown');
		expect(host.pressed).toBe(true);

		pointerOn(button, release);
		expect(host.pressed).toBe(false);
		expect(trace).toEqual([true, false]);
		expect(button.hasAttribute('aria-pressed')).toBe(false);
	},
);

test.each([' ', 'Enter'])(
	'a momentary button is held by "%s" until its keyup, ignoring repeats',
	(name) => {
		const { button, host } = mountButton('momentary');
		const trace = holdTrace(host);

		keyOn(button, 'keydown', { key: name });
		keyOn(button, 'keydown', { key: name, repeat: true });
		keyOn(button, 'keydown', { key: name, repeat: true });
		keyOn(button, 'keyup', { key: name === ' ' ? 'Enter' : ' ' });
		expect(host.pressed).toBe(true);

		keyOn(button, 'keyup', { key: name });
		expect(host.pressed).toBe(false);
		expect(trace).toEqual([true, false]);
	},
);

test('a momentary button ignores another pointer while held and its click after release', () => {
	const { button, host } = mountButton('momentary');
	const trace = holdTrace(host);

	pointerOn(button, 'pointerdown', 1);
	pointerOn(button, 'pointerdown', 2);
	pointerOn(button, 'pointerup', 2);
	expect(host.pressed).toBe(true);

	pointerOn(button, 'pointerup', 1);
	button.click();
	expect(trace).toEqual([true, false]);
});

test('two momentary buttons hold at once, and focus moving to the second keeps the first down', () => {
	document.body.innerHTML =
		'<sonic-button momentary></sonic-button><sonic-button momentary></sonic-button>';

	const [first, second] = document.querySelectorAll('sonic-button');
	const firstButton = first?.querySelector('button');
	const secondButton = second?.querySelector('button');
	if (!first || !second || !firstButton || !secondButton)
		throw new Error('The buttons did not render');

	firstButton.focus();
	pointerOn(firstButton, 'pointerdown', 1);
	secondButton.focus();
	pointerOn(secondButton, 'pointerdown', 2);

	expect(first.pressed).toBe(true);
	expect(second.pressed).toBe(true);
});

test('blur releases a momentary button held from the keyboard', () => {
	const { button, host } = mountButton('momentary');
	const trace = holdTrace(host);

	button.focus();
	keyOn(button, 'keydown', { key: ' ' });
	button.blur();

	expect(host.pressed).toBe(false);
	expect(trace).toEqual([true, false]);
});

test('disconnecting releases a held momentary button', async () => {
	const { button, host } = mountButton('momentary');
	const trace = holdTrace(host, host);

	pointerOn(button, 'pointerdown');
	host.remove();
	await Promise.resolve();

	expect(host.pressed).toBe(false);
	expect(trace).toEqual([true, false]);
});

test('disabled releases a held momentary button and ignores the next press', () => {
	const { button, host } = mountButton('momentary');
	const trace = holdTrace(host);

	pointerOn(button, 'pointerdown');
	host.disabled = true;
	expect(host.pressed).toBe(false);

	pointerOn(button, 'pointerdown', 2);
	keyOn(button, 'keydown', { key: 'Enter' });
	expect(host.pressed).toBe(false);
	expect(trace).toEqual([true, false]);
});

test('a secondary mouse button does not hold a momentary button', () => {
	const { button, host } = mountButton('momentary');

	button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, pointerId: 1 }));

	expect(host.pressed).toBe(false);
});

test('naming a held momentary button keeps it held', () => {
	const { button, host } = mountButton('momentary');
	const trace = holdTrace(host);

	pointerOn(button, 'pointerdown');
	host.setAttribute('aria-label', 'Kick');

	expect(host.pressed).toBe(true);
	expect(trace).toEqual([true]);
});

test('a button re-appended after removal latches once per press', async () => {
	const { button, host } = mountButton('latching');
	let changes = 0;

	host.remove();
	await Promise.resolve();
	document.body.append(host);
	host.addEventListener('change', () => (changes += 1));
	button.click();

	expect(host.pressed).toBe(true);
	expect(changes).toBe(1);
});

test('latching wins over momentary', () => {
	const { button, host } = mountButton('momentary latching');

	pointerOn(button, 'pointerdown');
	pointerOn(button, 'pointerup');
	expect(host.pressed).toBe(false);

	button.click();
	expect(host.pressed).toBe(true);
	expect(button.getAttribute('aria-pressed')).toBe('true');
});

test('latching set as a property latches the next press', () => {
	const { button, host } = mountButton('');

	host.latching = true;
	expect(button.getAttribute('aria-pressed')).toBe('false');

	button.click();
	expect(host.pressed).toBe(true);

	host.latching = false;
	expect(host.hasAttribute('latching')).toBe(false);
	expect(button.hasAttribute('aria-pressed')).toBe(false);
});

test('focus() and blur() reach the native button', () => {
	const { button, host } = mountButton('');

	host.focus();
	expect(document.activeElement).toBe(button);

	host.blur();
	expect(document.activeElement).toBe(document.body);
});

test('an undefined from plain JavaScript clears pressed and disabled rather than toggling them', () => {
	const { button, host } = mountButton('disabled pressed latching');

	Reflect.set(host, 'pressed', undefined);
	Reflect.set(host, 'disabled', undefined);
	expect(host.pressed).toBe(false);
	expect(button.getAttribute('aria-pressed')).toBe('false');
	expect(host.hasAttribute('pressed')).toBe(true);
	expect(host.hasAttribute('disabled')).toBe(false);
});

test('a press moves the live state and leaves the pressed attribute as the default', () => {
	const { button, host } = mountButton('pressed latching');

	button.click();
	expect(host.pressed).toBe(false);
	expect(host.defaultPressed).toBe(true);
	expect(host.hasAttribute('pressed')).toBe(true);
});

test('writing the pressed attribute moves a button pressed by hand', () => {
	const { button, host } = mountButton('pressed latching');

	button.click();
	host.setAttribute('pressed', '');
	expect(host.pressed).toBe(true);
	expect(button.getAttribute('aria-pressed')).toBe('true');

	button.click();
	button.click();
	host.removeAttribute('pressed');
	expect(host.pressed).toBe(false);
});

test('defaultPressed reflects, and moves the live state until a press', () => {
	const { button, host } = mountButton('latching');

	host.defaultPressed = true;
	expect(host.hasAttribute('pressed')).toBe(true);
	expect(host.pressed).toBe(true);

	host.pressed = false;
	host.defaultPressed = false;
	host.defaultPressed = true;
	expect(host.hasAttribute('pressed')).toBe(true);
	expect(button.getAttribute('aria-pressed')).toBe('true');

	button.click();
	host.defaultPressed = false;
	expect(host.pressed).toBe(false);
	expect(host.hasAttribute('pressed')).toBe(false);
});

test('a default set before the tag upgrades lands before the live state', async () => {
	document.body.innerHTML = '<sonic-late-button latching></sonic-late-button>';

	const late = document.querySelector<SonicButton>('sonic-late-button');
	if (!late) throw new Error('The element was not parsed');

	late.defaultPressed = true;
	late.pressed = false;

	const { SonicButton } = await import('#elements/button.ts');

	customElements.define('sonic-late-button', class extends SonicButton {});
	expect(late.hasAttribute('pressed')).toBe(true);
	expect(late.pressed).toBe(false);
});

test('busy marks the native button busy and leaves it pressable', () => {
	const { button, host } = mountButton('busy latching');

	expect(button.getAttribute('aria-busy')).toBe('true');

	button.click();
	expect(host.pressed).toBe(true);

	host.busy = false;
	expect(button.hasAttribute('aria-busy')).toBe(false);
});

test('a soft-disabled button keeps its tab stop but swallows clicks and holds', () => {
	const { button, host } = mountButton('soft-disabled latching');
	const heard: Array<string> = [];

	for (const type of ['click', 'change']) {
		host.addEventListener(type, () => {
			heard.push(type);
		});
	}

	expect(button.disabled).toBe(false);
	expect(button.getAttribute('aria-disabled')).toBe('true');

	button.click();
	expect(host.pressed).toBe(false);
	expect(heard).toEqual([]);

	host.softDisabled = false;
	button.click();
	expect(host.pressed).toBe(true);
	expect(heard).toEqual(['change', 'click']);
});

test('a soft-disabled momentary button does not hold', () => {
	const { button, host } = mountButton('soft-disabled momentary');

	button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));

	expect(host.pressed).toBe(false);
});

test('disabled wins over soft-disabled', () => {
	const { button } = mountButton('disabled soft-disabled');

	expect(button.disabled).toBe(true);
	expect(button.hasAttribute('aria-disabled')).toBe(false);
});

test('a momentary button held under Meta releases when Meta lifts', () => {
	const { button, host } = mountButton('momentary');
	const trace = holdTrace(host);

	keyOn(button, 'keydown', { key: 'Meta', metaKey: true });
	keyOn(button, 'keydown', { key: 'Enter', metaKey: true });
	expect(host.pressed).toBe(true);

	keyOn(button, 'keyup', { key: 'Meta' });
	expect(host.pressed).toBe(false);
	expect(trace).toEqual([true, false]);
});

test('a Meta keyup leaves a momentary button held by a pointer alone', () => {
	const { button, host } = mountButton('momentary');

	pointerOn(button, 'pointerdown');
	keyOn(button, 'keyup', { key: 'Meta' });

	expect(host.pressed).toBe(true);
});

test('a cloned button discards the native button it was cloned with', async () => {
	const { host } = mountControl('sonic-button', '', '<span id="label">Play</span>');
	const clone = host.cloneNode(true);
	if (!(clone instanceof HTMLElement)) throw new Error('The clone is not an element');

	document.body.append(clone);
	await nextTask();

	expect(clone.querySelectorAll('button')).toHaveLength(1);
	expect(clone.querySelector('.sonic-button-cap')?.getHTML()).toBe(
		'<span id="sonic-copy-label">Play</span>',
	);
});

test('a change inside one child leaves the copies of its siblings in place', async () => {
	const { host } = mountControl(
		'sonic-button',
		'',
		'<svg data-icon="play"></svg><span>Play</span>',
	);
	const cap = host.querySelector('.sonic-button-cap');
	const label = host.querySelector(':scope > span');

	await nextTask();

	const icon = cap?.firstChild;

	label?.classList.add('is-live');
	await nextTask();

	expect(icon).toBeInstanceOf(SVGElement);
	expect(cap?.firstChild).toBe(icon);
	expect(cap?.querySelector('span')?.className).toBe('is-live');
});

test('controls, expanded and popup on the host reach the native button as ARIA and follow it', () => {
	const { button, host } = mountButton('controls="queue" expanded="false" popup="dialog"');

	expect(button.getAttribute('aria-controls')).toBe('queue');
	expect(button.getAttribute('aria-haspopup')).toBe('dialog');

	host.setAttribute('expanded', 'true');
	expect(button.getAttribute('aria-expanded')).toBe('true');

	host.removeAttribute('expanded');
	expect(button.hasAttribute('aria-expanded')).toBe(false);
});

test('legend shows the child named for it, and leaves pressed and released children to the press', async () => {
	const { control, host } = mountControl(
		'sonic-button',
		'legend="low"',
		'<svg data-sonic-when="low"></svg><svg data-sonic-when="full"></svg><svg data-sonic-when="pressed"></svg>',
	);
	const hidden = (): Array<string | undefined> =>
		[...control.querySelectorAll<SVGElement>('[data-sonic-hidden]')].map(
			(part) => part.dataset.sonicWhen,
		);

	await nextTask();
	expect(hidden()).toEqual(['full']);

	host.legend = 'full';
	expect(hidden()).toEqual(['low']);

	host.legend = undefined;
	expect(hidden()).toEqual(['low', 'full']);
});
