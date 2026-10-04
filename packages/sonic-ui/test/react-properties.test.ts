import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test } from 'vitest';

import '#define/dial.ts';
import '#define/meter.ts';
import '#define/number.ts';
import '#define/slider.ts';
import '#define/xy.ts';

import { nextTask, pressKey } from './helpers.ts';

// React warns about updates outside `act` unless told it runs in a test
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

let root: Root | undefined;

afterEach(() => {
	act(() => {
		root?.unmount();
	});
	root = undefined;
});

async function render(node: ReactNode): Promise<void> {
	if (!root) {
		document.body.innerHTML = '<div id="root"></div>';

		const container = document.querySelector('#root');
		if (!container) throw new Error('The container is missing');

		root = createRoot(container);
	}
	act(() => {
		root?.render(node);
	});
	await nextTask();
}

function read(selector: string, property: string): unknown {
	const host = document.querySelector(selector);
	if (!host) throw new Error(`No ${selector}`);

	return Reflect.get(host, property);
}

// React sets a prop as a property once the element is defined, so these strings never pass through an attribute
test('a client render with string props sets each value control, snapped to its step', async () => {
	await render(
		createElement(
			'main',
			undefined,
			createElement('sonic-dial', { max: '90', min: '10', step: '5', value: '42' }),
			createElement('sonic-slider', { max: '90', min: '10', modulationValue: '60', value: '70' }),
			createElement('sonic-number', { max: '90', min: '10', step: '0.5', value: '33.3' }),
		),
	);

	expect(read('sonic-dial', 'value')).toBe(40);
	expect(read('sonic-slider', 'value')).toBe(70);
	expect(read('sonic-slider', 'modulationValue')).toBe(60);
	expect(read('sonic-number', 'value')).toBe(33.5);
});

// React sets props in key order, so `y` lands before the bounds that admit it
test('a client render with string props sets both values of an XY pad and a meter level', async () => {
	await render(
		createElement(
			'main',
			undefined,
			createElement('sonic-xy', { x: '25.4', xMin: '-50', y: '150', yMax: '200', yMin: '100' }),
			createElement('sonic-meter', { level: '0.5' }),
		),
	);

	expect([read('sonic-xy', 'x'), read('sonic-xy', 'y')]).toEqual([25, 150]);
	expect(read('sonic-meter', 'level')).toBe(0.5);
});

test('a blank or unreadable string leaves the value where it was', async () => {
	await render(createElement('sonic-dial', { min: '10', value: '42' }));

	const dial = document.querySelector('sonic-dial');
	if (!dial) throw new Error('No dial');

	Reflect.set(dial, 'value', '');
	Reflect.set(dial, 'value', ' ');
	Reflect.set(dial, 'value', 'loud');

	expect(dial.value).toBe(42);
});

test('a value set before its bounds is snapped again as they change', async () => {
	await render(createElement('sonic-dial', {}));

	const dial = document.querySelector('sonic-dial');
	if (!dial) throw new Error('No dial');

	dial.value = 152;
	expect(dial.value).toBe(100);

	dial.max = 200;
	expect(dial.value).toBe(152);

	dial.step = 5;
	expect(dial.value).toBe(150);

	dial.step = 1;
	expect(dial.value).toBe(152);
});

test('a value moved by a key stays where it landed when the step changes', async () => {
	await render(createElement('sonic-dial', { step: '5', value: '42' }));

	const dial = document.querySelector('sonic-dial');
	const control = dial?.querySelector<HTMLElement>('.sonic-dial');
	if (!dial || !control) throw new Error('No dial');

	pressKey(control, 'ArrowUp');
	expect(dial.value).toBe(45);

	dial.step = 1;
	expect(dial.value).toBe(45);
});

test('a removed prop puts the value back on its attribute or its minimum, and clears a modulation value', async () => {
	await render(
		createElement(
			'main',
			undefined,
			createElement('sonic-slider', { min: '10', modulationValue: '60', value: '70' }),
			createElement('sonic-xy', { x: '25', xMin: '-50', y: '75' }),
		),
	);
	await render(
		createElement(
			'main',
			undefined,
			createElement('sonic-slider', { min: '10' }),
			createElement('sonic-xy', { xMin: '-50', y: '75' }),
		),
	);

	expect(read('sonic-slider', 'value')).toBe(10);
	expect(read('sonic-slider', 'modulationValue')).toBeUndefined();
	expect([read('sonic-xy', 'x'), read('sonic-xy', 'y')]).toEqual([-50, 75]);
});
