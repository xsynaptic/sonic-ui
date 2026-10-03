import { describe, expect, test, vi } from 'vitest';

import type { SonicDial } from '#elements/dial.ts';

import '#define/dial.ts';
import { formatPercent, parsePercent } from '#lib/percent.ts';

import { mountDial, pressKey, recordEvents } from './helpers.ts';

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

test('a dial without a value starts at min', () => {
	const { control, dial } = mountDial('min="-10" max="10"');

	expect(dial.value).toBe(-10);
	expect(control.getAttribute('aria-valuenow')).toBe('-10');
});

test('a non-finite value is ignored', () => {
	const { control, dial } = mountDial('value="30"');

	dial.value = NaN;
	dial.value = Infinity;

	expect(dial.value).toBe(30);
	expect(control.getAttribute('aria-valuenow')).toBe('30');
});

test('a key the control moves by is taken, and one it does not use keeps its default', () => {
	const { control, dial } = mountDial('min="-5" max="5" step="0.25" value="1"');

	expect(pressKey(control, 'PageUp').defaultPrevented).toBe(true);
	expect(dial.value).toBe(3.5);
	expect(pressKey(control, 'Tab').defaultPrevented).toBe(false);
});

test('a key fires input and change only when the value moves', () => {
	const { control } = mountDial('value="99"');
	const events = recordEvents(document.body);

	pressKey(control, 'End');
	pressKey(control, 'End');

	expect(events).toEqual(['input', 'change']);
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

test('formatValueText speaks apart from formatValue, which the entry keeps, and falls back to it when unset', () => {
	const { control, dial } = mountDial('max="300" step="0" value="65"');
	const entry = entryOf(control);

	dial.formatValue = (value) =>
		`${String(Math.floor(value / 60))}:${String(value % 60).padStart(2, '0')}`;
	dial.parseValue = Number;
	dial.formatValueText = (value) => `${String(value)} seconds`;
	expect(control.getAttribute('aria-valuetext')).toBe('65 seconds');

	dial.formatValueText = undefined;
	expect(control.getAttribute('aria-valuetext')).toBe('1:05');

	dial.formatValueText = (value) => `${String(value)} seconds`;
	press(control);
	press(control);
	expect(entry.value).toBe('1:05');
});

test('valueText follows input in the shown format, not the spoken one', () => {
	const { control, dial } = mountDial('min="-12" max="12" step="1.5" value="3"');
	const texts: Array<string> = [];
	const listening = new AbortController();

	dial.formatValue = (value) => `${String(value)} dB`;
	dial.formatValueText = (value) => `${String(value)} decibels`;
	document.body.addEventListener(
		'input',
		() => {
			texts.push(dial.valueText);
		},
		{ signal: listening.signal },
	);
	pressKey(control, 'ArrowUp');
	pressKey(control, 'ArrowUp');
	dial.formatValue = undefined;
	pressKey(control, 'ArrowDown');
	listening.abort();

	expect(texts).toEqual(['4.5 dB', '6 dB', '4.5']);
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

test('two presses half a second apart do not open the entry', () => {
	const { control } = mountDial('value="50"');

	press(control);
	vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 500);
	press(control);

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

test('an arrow key in the entry moves the caret, not the value', () => {
	const { control, dial } = mountDial('value="50"');
	const entry = entryOf(control);

	press(control);
	press(control);

	expect(pressKey(entry, 'ArrowUp').defaultPrevented).toBe(false);
	expect(dial.value).toBe(50);
	expect(entry.hidden).toBe(false);
});

test('naming the dial leaves an open entry open', () => {
	const { control, dial } = mountDial('value="50"');
	const entry = entryOf(control);

	press(control);
	press(control);
	dial.setAttribute('aria-label', 'Level');

	expect(entry.hidden).toBe(false);
	expect(document.activeElement).toBe(entry);
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

test('leaving the entry untouched keeps a value its format rounds', () => {
	const { control, dial } = mountDial('max="1" step="0.005" value="0.505"');
	const entry = entryOf(control);
	const events = recordEvents(document.body);

	dial.formatValue = formatPercent;
	dial.parseValue = parsePercent;
	press(control);
	press(control);
	entry.blur();

	expect(dial.value).toBe(0.505);
	expect(events).toEqual([]);
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

test('writing the current value leaves the control untouched but still counts as set', () => {
	const { control, dial } = mountDial('value="150"');
	const records: Array<MutationRecord> = [];
	const observer = new MutationObserver((batch) => {
		records.push(...batch);
	});

	observer.observe(dial, { attributes: true, characterData: true, childList: true, subtree: true });
	dial.value = 100;

	expect([...records, ...observer.takeRecords()]).toEqual([]);

	dial.setAttribute('max', '200');
	observer.disconnect();

	expect(dial.value).toBe(100);
	expect(control.getAttribute('aria-valuemax')).toBe('200');
});

test('a property write renders as its attribute would, and undefined removes the attribute', () => {
	const { control, dial } = mountDial('value="80"');

	dial.max = 200;
	dial.value = 150;
	expect(dial.getAttribute('max')).toBe('200');
	expect(control.getAttribute('aria-valuemax')).toBe('200');
	expect(control.style.getPropertyValue('--_sonic-dial-value')).toBe('0.75');

	dial.max = undefined;
	expect(dial.hasAttribute('max')).toBe(false);
	expect(control.getAttribute('aria-valuemax')).toBe('100');
	expect(dial.value).toBe(100);

	dial.notched = true;
	expect(control.style.getPropertyValue('--_sonic-dial-positions')).toBe('101');

	dial.notched = false;
	expect(dial.hasAttribute('notched')).toBe(false);
});

test('an unset origin reads undefined, so writing it back leaves it following min', () => {
	const { control, dial } = mountDial('min="-50" max="50"');

	const { origin } = dial;

	dial.origin = origin;
	expect(dial.hasAttribute('origin')).toBe(false);

	dial.min = 0;
	expect(control.style.getPropertyValue('--_sonic-dial-origin')).toBe('0');
});

test('double-press reads type while unset, and type is a valid value', () => {
	const { control, dial } = mountDial('default="50" double-press="reset" value="80"');

	dial.doublePress = dial.doublePress === 'reset' ? 'type' : 'reset';
	expect(dial.getAttribute('double-press')).toBe('type');

	press(control);
	press(control);
	expect(entryOf(control).hidden).toBe(false);
	expect(dial.value).toBe(80);
});

test('a range set before the tag upgrades lands before the value it bounds', async () => {
	document.body.innerHTML = '<sonic-late-range></sonic-late-range>';

	const late = document.querySelector<SonicDial>('sonic-late-range');
	if (!late) throw new Error('The element was not parsed');

	late.value = 150;
	late.max = 200;

	const { SonicDial } = await import('#elements/dial.ts');

	customElements.define('sonic-late-range', class extends SonicDial {});
	expect(late.value).toBe(150);
	expect(late.getAttribute('max')).toBe('200');
});

test('focus() and blur() reach the control', () => {
	const { control, dial } = mountDial('value="50"');

	dial.focus();
	expect(document.activeElement).toBe(control);

	dial.blur();
	expect(document.activeElement).toBe(document.body);
});

test('focus() leaves an open entry focused, and blur() commits it', () => {
	const { control, dial } = mountDial('value="50"');
	const entry = entryOf(control);

	press(control);
	press(control);
	entry.value = '66';
	dial.focus();
	expect(document.activeElement).toBe(entry);

	dial.blur();
	expect(entry.hidden).toBe(true);
	expect(dial.value).toBe(66);
});

test('a disabled dial takes no focus', () => {
	const { dial } = mountDial('disabled value="50"');

	dial.focus();
	expect(document.activeElement).toBe(document.body);
});

describe('an endless dial from 10 to 370 in steps of 7.5', () => {
	const endless = 'endless min="10" max="370" step="7.5"';

	test('the modulation is ignored', () => {
		const { control } = mountDial(`${endless} modulation="30" value="190"`);

		expect(control.style.getPropertyValue('--_sonic-dial-modulation-from')).toBe('0.5');
		expect(control.style.getPropertyValue('--_sonic-dial-modulation-to')).toBe('0.5');
	});

	test('turning endless on wraps the value attribute rather than clamping it', () => {
		const { dial } = mountDial('min="10" max="370" step="7.5" value="400"');

		expect(dial.value).toBe(370);

		dial.endless = true;
		expect(dial.value).toBe(40);
	});
});

const modulatedPlace = '--_sonic-dial-modulated';

test('modulated is placed along the range, clamped to its ends', () => {
	const { control, dial } = mountDial('min="20" max="120" value="40"');

	dial.modulated = 95;
	expect(control.style.getPropertyValue(modulatedPlace)).toBe('0.75');

	dial.modulated = 500;
	expect(control.style.getPropertyValue(modulatedPlace)).toBe('1');
});

test('modulated follows a taper', () => {
	const { control, dial } = mountDial('min="20" max="20000" taper="log" value="200"');

	dial.modulated = 632.5;

	expect(Number(control.style.getPropertyValue(modulatedPlace))).toBeCloseTo(0.5, 3);
});

test('modulated moves neither the value nor its ARIA, and reports nothing', () => {
	const { control, dial } = mountDial('min="20" max="120" value="40"');
	const events = recordEvents(document.body);

	dial.modulated = 95;

	expect(events).toEqual([]);
	expect(dial.value).toBe(40);
	expect(dial.modulated).toBe(95);
	expect(control.getAttribute('aria-valuenow')).toBe('40');
});

test('undefined clears modulated, NaN is ignored, and a range change re-places it', () => {
	const { control, dial } = mountDial('min="20" max="120" value="40"');

	dial.modulated = 95;
	dial.modulated = NaN;
	expect(control.style.getPropertyValue(modulatedPlace)).toBe('0.75');

	dial.max = 170;
	expect(control.style.getPropertyValue(modulatedPlace)).toBe('0.5');

	dial.modulated = undefined;
	expect(control.style.getPropertyValue(modulatedPlace)).toBe('');
});

test('an endless dial places no modulated value', () => {
	const { control, dial } = mountDial('endless min="10" max="370" step="7.5" value="190"');

	dial.modulated = 100;

	expect(control.style.getPropertyValue(modulatedPlace)).toBe('');
});
