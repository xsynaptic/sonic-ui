import { expect, test } from 'vitest';

// @vitest-environment happy-dom
import type { SonicDial } from '#elements/dial.ts';

import '#define/dial.ts';

function mountDial(attributes: string): { control: HTMLElement; dial: SonicDial } {
	document.body.innerHTML = `<sonic-dial ${attributes}></sonic-dial>`;

	const dial = document.querySelector('sonic-dial');
	const control = dial?.querySelector<HTMLElement>('.sonic-dial');
	if (!dial || !control) throw new Error('The dial did not render');

	return { control, dial };
}

function pressKey(control: HTMLElement, key: string): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key });

	control.dispatchEvent(event);

	return event;
}

test('a value parsed before its max is not clamped to the default max', () => {
	const { control, dial } = mountDial('value="150" max="200"');

	expect(dial.value).toBe(150);
	expect(control.getAttribute('aria-valuenow')).toBe('150');
});

test('a max set by script after the value re-reads the value attribute', () => {
	const dial = document.createElement('sonic-dial');

	dial.setAttribute('value', '150');
	document.body.replaceChildren(dial);
	expect(dial.value).toBe(100);

	dial.setAttribute('max', '200');
	expect(dial.value).toBe(150);
});

test('once the property sets the value, a range change clamps it rather than re-reading the attribute', () => {
	const { dial } = mountDial('value="80"');

	dial.value = 50;
	dial.setAttribute('max', '40');
	expect(dial.value).toBe(40);

	dial.setAttribute('max', '200');
	expect(dial.value).toBe(40);
});

test('a non-finite value is ignored', () => {
	const { control, dial } = mountDial('value="30"');

	dial.value = NaN;
	dial.value = Infinity;

	expect(dial.value).toBe(30);
	expect(control.getAttribute('aria-valuenow')).toBe('30');
});

test.each([
	['ArrowUp', 51],
	['ArrowRight', 51],
	['ArrowDown', 49],
	['ArrowLeft', 49],
	['PageUp', 60],
	['PageDown', 40],
	['Home', 0],
	['End', 100],
])('%s moves a dial at 50 to %d', (key, expected) => {
	const { control, dial } = mountDial('value="50"');

	expect(pressKey(control, key).defaultPrevented).toBe(true);
	expect(dial.value).toBe(expected);
});

test('an unstepped range steps its keys by a hundredth of the range', () => {
	const { control, dial } = mountDial('max="1" step="0" value="0.5"');

	pressKey(control, 'ArrowUp');
	expect(dial.value).toBe(0.51);

	pressKey(control, 'PageDown');
	expect(dial.value).toBe(0.41);
});

test('a key the control does not use keeps its default', () => {
	const { control } = mountDial('value="50"');

	expect(pressKey(control, 'Tab').defaultPrevented).toBe(false);
});

test('a key fires input and change only when the value moves', () => {
	const { control, dial } = mountDial('value="99"');
	const events: Array<string> = [];

	dial.addEventListener('input', () => {
		events.push('input');
	});
	dial.addEventListener('change', () => {
		events.push('change');
	});

	pressKey(control, 'End');
	pressKey(control, 'End');

	expect(events).toEqual(['input', 'change']);
});

test.each([
	['notched max="7"', '8'],
	['notched min="-3" max="3"', '7'],
	['notched step="0"', ''],
	['notched max="0"', ''],
	['max="7"', ''],
])('%s sets the notch count to "%s"', (attributes, expected) => {
	const { control } = mountDial(attributes);

	expect(control.style.getPropertyValue('--_sonic-dial-positions')).toBe(expected);
});

test.each([
	['value="80" modulation="50"', '0.8', '1'],
	['value="20" modulation="-50"', '0', '0.2'],
	['value="40" modulation="25"', '0.4', '0.65'],
])('%s lights the modulation from %s to %s', (attributes, from, to) => {
	const { control } = mountDial(attributes);

	expect(control.style.getPropertyValue('--_sonic-dial-modulation-from')).toBe(from);
	expect(control.style.getPropertyValue('--_sonic-dial-modulation-to')).toBe(to);
});

test.each([
	['min="-50" max="50" origin="0"', '0.5'],
	['min="-50" max="50" origin="-80"', '0'],
	['min="-50" max="50" origin="80"', '1'],
	['min="-50" max="50"', '0'],
])('%s puts the origin at %s', (attributes, expected) => {
	const { control } = mountDial(`${attributes} value="20"`);

	expect(control.style.getPropertyValue('--_sonic-dial-origin')).toBe(expected);
});

test('moving the origin re-renders without touching the value', () => {
	const { control, dial } = mountDial('min="-50" max="50" value="20"');
	const events = recordEvents(dial);

	dial.value = -30;
	dial.setAttribute('origin', '25');

	expect(control.style.getPropertyValue('--_sonic-dial-origin')).toBe('0.75');
	expect(dial.value).toBe(-30);
	expect(control.getAttribute('aria-valuenow')).toBe('-30');
	expect(events).toEqual([]);
});

function entryOf(control: HTMLElement): HTMLInputElement {
	const entry = control.querySelector('input');
	if (!entry) throw new Error('The dial has no entry');

	return entry;
}

function press(control: HTMLElement, init: PointerEventInit = {}): void {
	const options = { bubbles: true, button: 0, clientX: 10, clientY: 10, pointerId: 1, ...init };

	control.dispatchEvent(new PointerEvent('pointerdown', options));
	control.dispatchEvent(new PointerEvent('pointerup', options));
}

function recordEvents(dial: SonicDial): Array<string> {
	const events: Array<string> = [];

	dial.addEventListener('input', () => {
		events.push('input');
	});
	dial.addEventListener('change', () => {
		events.push('change');
	});

	return events;
}

function typeKey(entry: HTMLInputElement, key: string): void {
	entry.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
}

test.each(['aria-describedby', 'aria-label', 'aria-labelledby'])(
	'%s is forwarded from the host as it is added, changed and removed',
	(name) => {
		const { control, dial } = mountDial(`${name}="first"`);

		expect(control.getAttribute(name)).toBe('first');

		dial.setAttribute(name, 'second');
		expect(control.getAttribute(name)).toBe('second');

		dial.removeAttribute(name);
		expect(control.hasAttribute(name)).toBe(false);
	},
);

test('an attribute outside the allowlist stays on the host', () => {
	const { control } = mountDial('title="Cutoff" label="Cutoff"');

	expect(control.hasAttribute('title')).toBe(false);
	expect(control.hasAttribute('aria-label')).toBe(false);
});

test('formatValue writes the value text, and unsetting it clears it', () => {
	const { control, dial } = mountDial('max="1" step="0.01" value="0.5"');

	expect(control.hasAttribute('aria-valuetext')).toBe(false);

	dial.formatValue = (value) => `${String(Math.round(value * 100))}%`;
	expect(control.getAttribute('aria-valuetext')).toBe('50%');

	dial.value = 0.66;
	expect(control.getAttribute('aria-valuetext')).toBe('66%');

	dial.formatValue = undefined;
	expect(control.hasAttribute('aria-valuetext')).toBe(false);
});

// happy-dom skips `attributeChangedCallback` for attributes present at upgrade, so the value goes in as a property too
test('properties set before the tag upgrades still take effect', async () => {
	document.body.innerHTML = '<sonic-late></sonic-late>';

	const late = document.querySelector<SonicDial>('sonic-late');
	if (!late) throw new Error('The element was not parsed');

	late.value = 40;
	late.formatValue = (value) => `${String(value)} Hz`;

	const { SonicDial } = await import('#elements/dial.ts');

	customElements.define('sonic-late', class extends SonicDial {});
	expect(late.querySelector('.sonic-dial')?.getAttribute('aria-valuetext')).toBe('40 Hz');
});

test('Cmd- or Ctrl-click resets to the default and reports it', () => {
	const { control, dial } = mountDial('default="25" value="70"');
	const events = recordEvents(dial);

	press(control, { metaKey: true });
	expect(dial.value).toBe(25);

	dial.value = 70;
	press(control, { ctrlKey: true });
	expect(dial.value).toBe(25);
	expect(events).toEqual(['input', 'change', 'input', 'change']);
});

test('without a default, Cmd-click leaves the value alone', () => {
	const { control, dial } = mountDial('value="70"');
	const events = recordEvents(dial);

	press(control, { metaKey: true });

	expect(dial.value).toBe(70);
	expect(events).toEqual([]);
});

test('a double press hands the slider role to the entry, holding the value text selected', () => {
	const { control, dial } = mountDial('aria-label="Volume" max="1" step="0.01" value="0.5"');
	const entry = entryOf(control);

	dial.formatValue = (value) => `${String(Math.round(value * 100))}%`;
	dial.parseValue = (text) => Number(text.replace('%', '')) / 100;
	press(control);
	press(control);

	expect(entry.hidden).toBe(false);
	expect(document.activeElement).toBe(entry);
	expect(entry.value).toBe('50%');
	expect(entry.selectionStart).toBe(0);
	expect(entry.selectionEnd).toBe(3);
	expect(entry.getAttribute('aria-label')).toBe('Volume');
	for (const name of ['role', 'tabindex', 'aria-valuenow', 'aria-valuetext', 'aria-label']) {
		expect(control.hasAttribute(name), name).toBe(false);
	}
});

// `Number.parseFloat` would read "5 kHz" as 5
test('without parseValue, the entry holds the plain number, so committing it unchanged keeps the value', () => {
	const { control, dial } = mountDial('max="20000" min="20" value="5000"');
	const entry = entryOf(control);
	const events = recordEvents(dial);

	dial.formatValue = (value) => `${String(value / 1000)} kHz`;
	press(control);
	press(control);

	expect(entry.value).toBe('5000');
	expect(control.getAttribute('aria-valuetext')).toBeNull();

	typeKey(entry, 'Enter');

	expect(dial.value).toBe(5000);
	expect(events).toEqual([]);
	expect(control.getAttribute('aria-valuetext')).toBe('5 kHz');
});

test('with double-press="reset", a double press returns to the default rather than opening the entry', () => {
	const { control, dial } = mountDial('default="50" double-press="reset" value="80"');
	const events = recordEvents(dial);

	press(control);
	press(control);

	expect(dial.value).toBe(50);
	expect(events).toEqual(['input', 'change']);
	expect(entryOf(control).hidden).toBe(true);
});

test('two presses apart do not open the entry', () => {
	const { control } = mountDial('value="50"');

	press(control);
	press(control, { clientX: 20 });

	expect(entryOf(control).hidden).toBe(true);
});

test('Enter commits the typed value through parseValue and hands focus back', () => {
	const { control, dial } = mountDial('aria-label="Volume" max="1" step="0.01" value="0.5"');
	const entry = entryOf(control);
	const events = recordEvents(dial);

	dial.parseValue = (text) => Number(text) / 100;
	press(control);
	press(control);
	entry.value = '66';
	entry.dispatchEvent(new Event('input', { bubbles: true }));
	typeKey(entry, 'Enter');

	expect(dial.value).toBe(0.66);
	expect(events).toEqual(['input', 'change']);
	expect(entry.hidden).toBe(true);
	expect(control.getAttribute('role')).toBe('slider');
	expect(control.getAttribute('aria-valuenow')).toBe('0.66');
	expect(control.getAttribute('aria-label')).toBe('Volume');
	expect(document.activeElement).toBe(control);
});

test.each([
	['Escape', '80', 'Escape'],
	['a non-finite parse', 'loud', 'Enter'],
])('%s closes the entry and keeps the value', (_case, typed, key) => {
	const { control, dial } = mountDial('value="50"');
	const entry = entryOf(control);
	const events = recordEvents(dial);

	press(control);
	press(control);
	entry.value = typed;
	typeKey(entry, key);

	expect(dial.value).toBe(50);
	expect(events).toEqual([]);
	expect(entry.hidden).toBe(true);
	expect(control.getAttribute('role')).toBe('slider');
});

test('leaving the entry commits it, clamped and stepped as any value is', () => {
	const { control, dial } = mountDial('value="50"');
	const entry = entryOf(control);

	press(control);
	press(control);
	entry.value = '140.6';
	entry.blur();

	expect(dial.value).toBe(100);
	expect(entry.hidden).toBe(true);
});

test('disabled drops the tab stop, ignores keys, presses and reset, and cancels an open entry', () => {
	const { control, dial } = mountDial('default="0" value="50"');
	const entry = entryOf(control);

	press(control);
	press(control);
	entry.value = '80';
	dial.disabled = true;

	expect(entry.hidden).toBe(true);
	expect(dial.value).toBe(50);
	expect(control.getAttribute('aria-disabled')).toBe('true');
	expect(control.hasAttribute('tabindex')).toBe(false);

	pressKey(control, 'End');
	press(control, { metaKey: true });
	press(control);
	press(control);

	expect(dial.value).toBe(50);
	expect(entry.hidden).toBe(true);

	dial.removeAttribute('disabled');
	expect(control.hasAttribute('aria-disabled')).toBe(false);
	expect(control.getAttribute('tabindex')).toBe('0');
});

test.each(['', 'double-press="reset"'])(
	'with %s, Enter on the control opens the entry',
	(attributes) => {
		const { control } = mountDial(`value="40" ${attributes}`);

		expect(pressKey(control, 'Enter').defaultPrevented).toBe(true);
		expect(entryOf(control).hidden).toBe(false);
	},
);

test.each(['Backspace', 'Delete'])('%s resets to the default', (key) => {
	const { control, dial } = mountDial('default="50" value="80"');
	const events = recordEvents(dial);

	expect(pressKey(control, key).defaultPrevented).toBe(true);
	expect(dial.value).toBe(50);
	expect(events).toEqual(['input', 'change']);
});

test('Delete without a default leaves the value and the key alone', () => {
	const { control, dial } = mountDial('value="80"');

	expect(pressKey(control, 'Delete').defaultPrevented).toBe(false);
	expect(dial.value).toBe(80);
});

test.each(['ArrowUp', 'Delete', 'Enter'])(
	'%s already taken by a listener on the host is left to it',
	(key) => {
		const { control, dial } = mountDial('default="50" value="80"');

		dial.addEventListener(
			'keydown',
			(event) => {
				event.preventDefault();
			},
			{ capture: true },
		);
		pressKey(control, key);

		expect(dial.value).toBe(80);
		expect(entryOf(control).hidden).toBe(true);
	},
);
