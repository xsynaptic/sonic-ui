import { afterEach, expect, test, vi } from 'vitest';

import type { SonicValueElement } from '#elements/value-element.ts';

import '#define/dial.ts';
import '#define/envelope.ts';
import '#define/number.ts';
import '#define/slider.ts';
import '#define/split.ts';
import '#define/xy.ts';
import { SonicValueEvent } from '#elements/value-event.ts';
import { SonicXy } from '#elements/xy.ts';
import { requireChild } from '#lib/render.ts';

import { mountControl, mountDial, nextTask, pointerAt, pressKey } from './helpers.ts';

afterEach(() => {
	vi.useRealTimers();
	document.body.replaceChildren();
});

function recordReasons(target: EventTarget): Array<string> {
	const seen: Array<string> = [];

	for (const type of ['input', 'change']) {
		target.addEventListener(type, (event) => {
			const id = event.target instanceof Element && event.target.id ? `${event.target.id} ` : '';

			seen.push(`${id}${type} ${event instanceof SonicValueEvent ? event.reason : 'none'}`);
		});
	}

	return seen;
}

function press(target: HTMLElement, init: PointerEventInit = {}): void {
	pointerAt(target, 'pointerdown', { clientX: 10, clientY: 10, ...init });
	pointerAt(target, 'pointerup', { clientX: 10, clientY: 10, ...init });
}

test('a dial reports a drag, a key, a reset key, a reset press and a typed value as such', () => {
	const { control, dial } = mountDial('min="0" max="100" step="2" value="40" default="10"');
	const reasons = recordReasons(document.body);

	pointerAt(control, 'pointerdown', { clientY: 100 });
	pointerAt(control, 'pointermove', { clientY: 60 });
	pointerAt(control, 'pointerup', { clientY: 60 });
	pressKey(control, 'ArrowUp');
	pressKey(control, 'Backspace');
	pressKey(control, 'ArrowUp');
	pointerAt(control, 'pointerdown', { clientY: 10, ctrlKey: true });

	press(control);
	press(control);

	const entry = requireChild(control, 'input', HTMLInputElement);

	entry.value = '64';
	entry.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }),
	);

	expect(dial.value).toBe(64);
	expect(reasons).toEqual([
		'input drag',
		'change drag',
		'input key',
		'change key',
		'input reset',
		'change reset',
		'input key',
		'change key',
		'input reset',
		'change reset',
		'input entry',
		'change entry',
	]);
});

test("a number box's arrow and its step press report arrow and tap", () => {
	vi.useFakeTimers();

	const { control, host } = mountControl(
		'sonic-number',
		'arrows press="step" min="0" max="8" value="2"',
	);
	const reasons = recordReasons(document.body);

	press(requireChild(control, '.sonic-number-increment', HTMLElement));
	press(control);

	expect(host.value).toBe(4);
	expect(reasons).toEqual(['input arrow', 'change arrow', 'input tap', 'change tap']);
});

test('a sprung slider reports the drag it was let go from, then its spring back', () => {
	const { control, host } = mountControl(
		'sonic-slider',
		'spring min="-50" max="50" origin="0" value="0"',
	);
	const cap = requireChild(control, '.sonic-slider-cap', HTMLElement);
	const reasons = recordReasons(document.body);

	vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 0, 220, 40));
	vi.spyOn(cap, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 20, 40));
	pointerAt(cap, 'pointerdown', { clientX: 210 });
	pointerAt(cap, 'pointermove', { clientX: 250 });
	pointerAt(cap, 'pointerup', { clientX: 250 });

	expect(host.value).toBe(0);
	expect(reasons).toEqual(['input drag', 'change drag', 'input spring', 'change spring']);
});

test('an XY pad reports a press on its field, a key on an axis and a reset press', () => {
	document.body.innerHTML =
		'<sonic-xy x="0" x-min="-50" x-max="50" y="0" y-min="0" y-max="100" x-default="10"></sonic-xy>';

	const xy = requireChild(document.body, 'sonic-xy', SonicXy);
	const field = requireChild(xy, '.sonic-xy-field', HTMLDivElement);
	const reasons = recordReasons(document.body);

	vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 220, 120));
	vi.spyOn(
		requireChild(xy, '.sonic-xy-puck', HTMLDivElement),
		'getBoundingClientRect',
	).mockReturnValue(new DOMRect(0, 0, 20, 20));
	press(field, { clientX: 150, clientY: 40 });
	pressKey(requireChild(xy, '[data-sonic-axis="x"]', HTMLElement), 'ArrowRight');
	pointerAt(field, 'pointerdown', { clientX: 60, clientY: 60, ctrlKey: true });

	expect(xy.x).toBe(10);
	expect(reasons).toEqual([
		'input drag',
		'change drag',
		'input key',
		'change key',
		'input reset',
		'change reset',
	]);
});

test("the members a split moves report their mover's reason, and a script's write behind no gesture reports none", async () => {
	document.body.innerHTML = `<sonic-split total="100">
		<sonic-dial id="low" value="50"></sonic-dial><sonic-dial id="high" value="50"></sonic-dial>
	</sonic-split>`;
	await nextTask();

	const [low] = [...document.querySelectorAll<SonicValueElement>('sonic-dial')];
	if (!low) throw new Error('The split has no members');

	const reasons = recordReasons(document.body);

	pressKey(requireChild(low, '.sonic-dial', HTMLElement), 'ArrowUp');
	await nextTask();
	expect(reasons).toEqual(['low input key', 'high input key', 'low change key', 'high change key']);

	reasons.length = 0;
	low.value = 60;
	await nextTask();
	expect(reasons).toEqual(['high input none']);
});

test("an envelope's handle drag reports drag on the dial it turns", () => {
	document.body.innerHTML = `<sonic-dial id="attack" min="0" max="10" value="5"></sonic-dial>
		<sonic-envelope attack="attack"></sonic-envelope>`;

	const envelope = requireChild(document.body, 'sonic-envelope', HTMLElement);
	const handle = requireChild(
		envelope,
		'.sonic-envelope-handle[data-sonic-stage="attack"]',
		HTMLElement,
	);
	const reasons = recordReasons(document.body);

	vi.spyOn(
		requireChild(envelope, '.sonic-envelope-graph', SVGElement),
		'getBoundingClientRect',
	).mockReturnValue(new DOMRect(0, 0, 400, 100));
	pointerAt(handle, 'pointerdown', { clientX: 100, clientY: 100 });
	pointerAt(handle, 'pointermove', { clientX: 140, clientY: 100 });
	pointerAt(handle, 'pointerup', { clientX: 140, clientY: 100 });

	expect(reasons).toEqual(['attack input drag', 'attack change drag']);
});
