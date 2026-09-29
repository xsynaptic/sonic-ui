import { expect, test } from 'vitest';

import type { SonicDial } from '#elements/dial.ts';

import '#define/dial.ts';

import { mountDial, pressKey } from './helpers.ts';

// happy-dom computes no styles, so the dial falls back to 160px of travel and an 8px zone; 36 units over 160px is 0.225 a pixel
const range = 'min="-30" max="6" step="0.5" detent="0"';

function dragBy(
	{ control, dial }: { control: HTMLElement; dial: SonicDial },
	steps: Array<number>,
): Array<number> {
	const pointer = { bubbles: true, button: 0, pointerId: 1 };
	const values: Array<number> = [];

	control.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientY: 500 }));
	for (const step of steps) {
		control.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientY: 500 - step }));
		values.push(dial.value);
	}
	control.dispatchEvent(new PointerEvent('pointerup', { ...pointer, clientY: 500 }));

	return values;
}

test.each([
	{ expected: [0, 0.5], from: -3, steps: [20, 24] },
	{ expected: [0, -0.5], from: 3, steps: [-20, -24] },
])(
	'a drag from $from holds at the detent for the zone past it, then moves on from it',
	({ expected, from, steps }) => {
		expect(dragBy(mountDial(`${range} value="${String(from)}"`), steps)).toEqual(expected);
	},
);

test('a drag that starts on the detent has to push through the zone to leave it', () => {
	expect(dragBy(mountDial(`${range} value="0"`), [7, 12])).toEqual([0, 1]);
});

test('without a detent the same drag passes straight through', () => {
	expect(dragBy(mountDial('min="-30" max="6" step="0.5" value="-3"'), [20, 24])).toEqual([
		1.5, 2.5,
	]);
});

test('a Page key that would step across the detent lands on it, and the next moves on', () => {
	const { control, dial } = mountDial(`${range} value="-3"`);

	pressKey(control, 'PageUp');
	expect(dial.value).toBe(0);

	pressKey(control, 'PageUp');
	expect(dial.value).toBe(5);

	pressKey(control, 'PageDown');
	expect(dial.value).toBe(0);
});
