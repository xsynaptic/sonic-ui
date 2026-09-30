import { expect, test } from 'vitest';

import type { SonicDial } from '#elements/dial.ts';

import '#define/dial.ts';

import { mountDial, recordEvents } from './helpers.ts';

// happy-dom computes no styles, so the dial falls back to 160px of travel: 16px moves a 0 to 100 dial by 10
const pointer = { bubbles: true, button: 0, clientX: 10, pointerId: 1 };

function pointerAt(control: HTMLElement, type: string, clientY: number): void {
	control.dispatchEvent(new PointerEvent(type, { ...pointer, clientY, pointerType: 'mouse' }));
}

function touchAt(control: HTMLElement, type: string, clientY: number): void {
	control.dispatchEvent(new PointerEvent(type, { ...pointer, clientY, pointerType: 'touch' }));
}

test('a drag moves the value with the pointer and reports change on release', () => {
	const { control, dial } = mountDial('value="50"');
	const events = recordEvents(document.body);

	pointerAt(control, 'pointerdown', 100);
	pointerAt(control, 'pointermove', 84);
	expect(dial.value).toBe(60);

	pointerAt(control, 'pointerup', 84);
	expect(events).toEqual(['input', 'change']);
});

test.each([
	['mouse', 2, pointerAt],
	['touch', 6, touchAt],
])(
	'a %s press that wobbles %ipx leaves the value alone and reports nothing',
	(_pointerType, pixels, press) => {
		const { control, dial } = mountDial('max="127" value="64"');
		const events = recordEvents(dial);

		press(control, 'pointerdown', 100);
		press(control, 'pointermove', 100 - pixels);
		press(control, 'pointerup', 100 - pixels);

		expect(dial.value).toBe(64);
		expect(events).toEqual([]);
	},
);

test('a touch drag past the threshold catches up to the pointer', () => {
	const { control, dial } = mountDial('value="50"');

	touchAt(control, 'pointerdown', 100);
	touchAt(control, 'pointermove', 84);
	expect(dial.value).toBe(60);

	touchAt(control, 'pointermove', 100);
	expect(dial.value).toBe(50);
});

test('a wobbling first press still opens the entry on the second, with the value unchanged', () => {
	const { control, dial } = mountDial('max="127" value="64"');

	pointerAt(control, 'pointerdown', 100);
	pointerAt(control, 'pointermove', 102);
	pointerAt(control, 'pointerup', 102);
	pointerAt(control, 'pointerdown', 100);
	pointerAt(control, 'pointerup', 100);

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

	pointerAt(control, 'pointerdown', 100);
	pointerAt(control, 'pointermove', 84);
	write(dial);
	expect(dial.value).toBe(60);
	expect(control.getAttribute('aria-valuenow')).toBe('60');

	pointerAt(control, 'pointermove', 76);
	expect(dial.value).toBe(65);
});

test('a secondary button starts no drag', () => {
	const { control, dial } = mountDial('value="50"');

	control.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, button: 2, clientY: 100 }));
	pointerAt(control, 'pointermove', 84);

	expect(dial.value).toBe(50);
});

test('writes after release apply', () => {
	const { control, dial } = mountDial('value="50"');

	pointerAt(control, 'pointerdown', 100);
	pointerAt(control, 'pointermove', 84);
	pointerAt(control, 'pointerup', 84);

	dial.value = 10;
	expect(dial.value).toBe(10);

	dial.setAttribute('value', '20');
	expect(dial.value).toBe(20);
});

test('disabled mid-drag ends the drag, reporting the value it reached', () => {
	const { control, dial } = mountDial('value="50"');
	const events = recordEvents(dial);

	pointerAt(control, 'pointerdown', 100);
	pointerAt(control, 'pointermove', 84);
	dial.disabled = true;
	expect(events).toEqual(['input', 'change']);

	pointerAt(control, 'pointermove', 68);
	pointerAt(control, 'pointerup', 68);
	expect(dial.value).toBe(60);
	expect(events).toEqual(['input', 'change']);
});

test('lostpointercapture ends the drag, reporting the value it reached', () => {
	const { control, dial } = mountDial('value="50"');
	const events = recordEvents(dial);

	pointerAt(control, 'pointerdown', 100);
	pointerAt(control, 'pointermove', 84);
	pointerAt(control, 'lostpointercapture', 84);
	expect(events).toEqual(['input', 'change']);

	pointerAt(control, 'pointermove', 68);
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
		pointerAt(control, 'pointerdown', 100);
		pointerAt(control, 'pointerup', 100);
		pointerAt(control, 'lostpointercapture', 100);
	}

	expect(control.querySelector('input')?.hidden).toBe(false);
});

test('a disconnect mid-drag ends the drag, and the next connection starts clean', async () => {
	const { control, dial } = mountDial('value="50"');
	const events = recordEvents(dial);

	pointerAt(control, 'pointerdown', 100);
	pointerAt(control, 'pointermove', 84);
	dial.remove();
	await Promise.resolve();
	expect(events).toEqual(['input', 'change']);

	document.body.append(dial);
	pointerAt(control, 'pointermove', 68);
	expect(dial.value).toBe(60);

	dial.value = 10;
	expect(dial.value).toBe(10);
});

test('a move that keeps the element connected keeps the drag', async () => {
	const { control, dial } = mountDial('value="50"');

	pointerAt(control, 'pointerdown', 100);
	document.body.append(document.createElement('div'), dial);
	await Promise.resolve();
	pointerAt(control, 'pointermove', 84);

	expect(dial.value).toBe(60);
});
