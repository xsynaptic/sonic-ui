import { expect, test } from 'vitest';

import type { SonicDial } from '#elements/dial.ts';

import '#define/dial.ts';

import { mountDial, pointerAt, recordEvents } from './helpers.ts';

function mouseAt(control: HTMLElement, type: string, clientY: number): void {
	pointerAt(control, type, { clientY, pointerType: 'mouse' });
}

function touchAt(control: HTMLElement, type: string, clientY: number): void {
	pointerAt(control, type, { clientY, pointerType: 'touch' });
}

test('a drag moves the value with the pointer and reports change on release', () => {
	const { control, dial } = mountDial('value="50"');
	const events = recordEvents(document.body);

	mouseAt(control, 'pointerdown', 100);
	mouseAt(control, 'pointermove', 84);
	expect(dial.value).toBe(60);

	mouseAt(control, 'pointerup', 84);
	expect(events).toEqual(['input', 'change']);
});

test('a touch press that wobbles 6px leaves the value alone and reports nothing', () => {
	const { control, dial } = mountDial('max="127" value="64"');
	const events = recordEvents(dial);

	touchAt(control, 'pointerdown', 100);
	touchAt(control, 'pointermove', 94);
	touchAt(control, 'pointerup', 94);

	expect(dial.value).toBe(64);
	expect(events).toEqual([]);
});

test('a wobbling first press still opens the entry on the second, with the value unchanged', () => {
	const { control, dial } = mountDial('max="127" value="64"');

	mouseAt(control, 'pointerdown', 100);
	mouseAt(control, 'pointermove', 102);
	mouseAt(control, 'pointerup', 102);
	mouseAt(control, 'pointerdown', 100);
	mouseAt(control, 'pointerup', 100);

	expect(control.querySelector('input')?.hidden).toBe(false);
	expect(dial.value).toBe(64);
});

test.each([
	[
		'a property',
		(dial: SonicDial) => {
			dial.value = 10;
		},
	],
	[
		'an attribute',
		(dial: SonicDial) => {
			dial.setAttribute('value', '10');
		},
	],
])('%s write mid-drag leaves the value and the next move alone', (_case, write) => {
	const { control, dial } = mountDial('value="50"');

	mouseAt(control, 'pointerdown', 100);
	mouseAt(control, 'pointermove', 84);
	write(dial);
	expect(dial.value).toBe(60);
	expect(control.getAttribute('aria-valuenow')).toBe('60');

	mouseAt(control, 'pointermove', 76);
	expect(dial.value).toBe(65);
});

test('a travel of zero leaves the drag alive', () => {
	const { control, dial } = mountDial('value="50"');

	control.style.setProperty('--_sonic-dial-travel', '0px');
	mouseAt(control, 'pointerdown', 100);
	mouseAt(control, 'pointermove', 84);
	mouseAt(control, 'pointermove', 84);
	mouseAt(control, 'pointermove', 100);

	expect(dial.value).toBe(0);
});

test('a secondary button starts no drag', () => {
	const { control, dial } = mountDial('value="50"');

	pointerAt(control, 'pointerdown', { button: 2, clientY: 100 });
	mouseAt(control, 'pointermove', 84);

	expect(dial.value).toBe(50);
});

test('writes after release apply', () => {
	const { control, dial } = mountDial('value="50"');

	mouseAt(control, 'pointerdown', 100);
	mouseAt(control, 'pointermove', 84);
	mouseAt(control, 'pointerup', 84);

	dial.value = 10;
	expect(dial.value).toBe(10);

	dial.setAttribute('value', '20');
	expect(dial.value).toBe(20);
});

test('disabled mid-drag ends the drag, reporting the value it reached', () => {
	const { control, dial } = mountDial('value="50"');
	const events = recordEvents(dial);

	mouseAt(control, 'pointerdown', 100);
	mouseAt(control, 'pointermove', 84);
	dial.disabled = true;
	expect(events).toEqual(['input', 'change']);

	mouseAt(control, 'pointermove', 68);
	mouseAt(control, 'pointerup', 68);
	expect(dial.value).toBe(60);
	expect(events).toEqual(['input', 'change']);
});

test('lostpointercapture ends the drag, reporting the value it reached', () => {
	const { control, dial } = mountDial('value="50"');
	const events = recordEvents(dial);

	mouseAt(control, 'pointerdown', 100);
	mouseAt(control, 'pointermove', 84);
	mouseAt(control, 'lostpointercapture', 84);
	expect(events).toEqual(['input', 'change']);

	mouseAt(control, 'pointermove', 68);
	expect(dial.value).toBe(60);

	dial.value = 10;
	expect(dial.value).toBe(10);
});

test('pointercancel ends the drag back where it started, reporting no change', () => {
	const { control, dial } = mountDial('value="50"');
	const events = recordEvents(dial);

	touchAt(control, 'pointerdown', 100);
	touchAt(control, 'pointermove', 84);
	touchAt(control, 'pointercancel', 84);
	touchAt(control, 'lostpointercapture', 84);
	expect(dial.value).toBe(50);
	expect(events).toEqual(['input', 'input']);

	touchAt(control, 'pointermove', 68);
	expect(dial.value).toBe(50);
});

test('the lostpointercapture after a release leaves the double press intact', () => {
	const { control } = mountDial('value="50"');

	for (let presses = 0; presses < 2; presses += 1) {
		mouseAt(control, 'pointerdown', 100);
		mouseAt(control, 'pointerup', 100);
		mouseAt(control, 'lostpointercapture', 100);
	}

	expect(control.querySelector('input')?.hidden).toBe(false);
});

test('a disconnect mid-drag ends the drag, and the next connection starts clean', async () => {
	const { control, dial } = mountDial('value="50"');
	const events = recordEvents(dial);

	mouseAt(control, 'pointerdown', 100);
	mouseAt(control, 'pointermove', 84);
	dial.remove();
	await Promise.resolve();
	expect(events).toEqual(['input', 'change']);

	document.body.append(dial);
	mouseAt(control, 'pointermove', 68);
	expect(dial.value).toBe(60);

	dial.value = 10;
	expect(dial.value).toBe(10);
});

test('a move that keeps the element connected keeps the drag', async () => {
	const { control, dial } = mountDial('value="50"');

	mouseAt(control, 'pointerdown', 100);
	document.body.append(document.createElement('div'), dial);
	await Promise.resolve();
	mouseAt(control, 'pointermove', 84);

	expect(dial.value).toBe(60);
});

test('a second pointer leaves the drag alone, and the drag still ends with change', () => {
	const { control, dial } = mountDial('value="50"');
	const events = recordEvents(document.body);

	pointerAt(control, 'pointerdown', { clientY: 100, pointerId: 1 });
	pointerAt(control, 'pointermove', { clientY: 84, pointerId: 1 });
	pointerAt(control, 'pointerdown', { clientY: 100, isPrimary: false, pointerId: 2 });
	pointerAt(control, 'pointermove', { clientY: 68, pointerId: 1 });
	pointerAt(control, 'pointerup', { pointerId: 2 });
	pointerAt(control, 'pointermove', { clientY: 52, pointerId: 1 });
	pointerAt(control, 'pointerup', { pointerId: 1 });

	expect(dial.value).toBe(80);
	expect(events).toEqual(['input', 'input', 'input', 'change']);
});

test('a press from the pointer already held ends its drag with a change before the next', () => {
	const { control, dial } = mountDial('value="50"');
	const events = recordEvents(document.body);

	mouseAt(control, 'pointerdown', 100);
	mouseAt(control, 'pointermove', 84);
	mouseAt(control, 'pointerdown', 84);
	expect(events).toEqual(['input', 'change']);

	mouseAt(control, 'pointermove', 68);
	mouseAt(control, 'pointerup', 68);
	expect(dial.value).toBe(70);
	expect(events).toEqual(['input', 'change', 'input', 'change']);
});
