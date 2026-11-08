import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { SonicNumber } from '#elements/number.ts';

import '#define/number.ts';

import { mountControl, pointerAt, recordEvents } from './helpers.ts';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function mountArrows(attributes: string): {
	control: HTMLElement;
	decrement: HTMLElement;
	increment: HTMLElement;
	number: SonicNumber;
} {
	const { control, host } = mountControl('sonic-number', `arrows ${attributes}`);
	const decrement = control.querySelector<HTMLElement>('.sonic-number-decrement');
	const increment = control.querySelector<HTMLElement>('.sonic-number-increment');
	if (!decrement || !increment) throw new Error('The number box has no arrows');

	return { control, decrement, increment, number: host };
}

test('a held arrow steps on the press, again at 400 ms, then faster the longer it is held', () => {
	const { increment, number } = mountArrows('min="20" max="300" step="0.5" value="20"');

	pointerAt(increment, 'pointerdown');
	expect(number.value).toBe(20.5);

	vi.advanceTimersByTime(399);
	expect(number.value).toBe(20.5);

	vi.advanceTimersByTime(1);
	expect(number.value).toBe(21);

	// Repeats every 120 ms: 7 of one step before 1.2 s, 10 of two, 10 of four, then 4 of eight by 4 s
	vi.advanceTimersByTime(3600);
	expect(number.value).toBe(20 + 0.5 * 100);
});

test('a hold reports input on each step and one change on release', () => {
	const { decrement, number } = mountArrows('min="-10" max="10" step="0.25" value="5"');
	const events = recordEvents(document.body);

	pointerAt(decrement, 'pointerdown');
	vi.advanceTimersByTime(520);
	pointerAt(decrement, 'pointerup');
	vi.advanceTimersByTime(2000);

	expect(number.value).toBe(4.25);
	expect(events).toEqual(['input', 'input', 'input', 'change']);
});

test('a hold stops at a bound and leaves no timer running', () => {
	const { increment, number } = mountArrows('min="20" max="22" step="0.5" value="20"');
	const events = recordEvents(document.body);

	pointerAt(increment, 'pointerdown');
	vi.advanceTimersByTime(5000);

	expect(number.value).toBe(22);
	expect(vi.getTimerCount()).toBe(0);

	pointerAt(increment, 'pointerup');
	expect(events.filter((type) => type === 'change')).toEqual(['change']);
});

test('a held arrow on a list moves one position a repeat, however long it is held', () => {
	const positions = Array.from({ length: 40 }, (_, index) => (index + 1) * 3);
	const { increment, number } = mountArrows(`positions="${positions.join(' ')}" value="3"`);

	pointerAt(increment, 'pointerdown');
	vi.advanceTimersByTime(4000);

	// The press and 31 repeats
	expect(number.value).toBe(positions[32]);
});

test.each([
	[
		'pointercancel',
		(part: HTMLElement) => {
			pointerAt(part, 'pointercancel');
		},
	],
	[
		'lost capture',
		(part: HTMLElement) => {
			pointerAt(part, 'lostpointercapture');
		},
	],
	[
		'disabling',
		(part: HTMLElement) => part.closest('sonic-number')?.toggleAttribute('disabled', true),
	],
])('%s ends a hold with one change', (_case, endHold) => {
	const { increment, number } = mountArrows('min="0" max="100" value="10"');
	const events = recordEvents(document.body);

	pointerAt(increment, 'pointerdown');
	vi.advanceTimersByTime(400);
	endHold(increment);
	vi.advanceTimersByTime(2000);

	expect(number.value).toBe(12);
	expect(events.filter((type) => type === 'change')).toEqual(['change']);
	expect(Object.hasOwn(increment.dataset, 'sonicPressed')).toBe(false);
});

test('removing the number box ends a hold once the removal holds', async () => {
	const { increment, number } = mountArrows('min="0" max="100" value="10"');

	pointerAt(increment, 'pointerdown');
	number.remove();
	await Promise.resolve();
	vi.advanceTimersByTime(2000);

	expect(number.value).toBe(11);
	expect(vi.getTimerCount()).toBe(0);
});

test('a release then the lost capture it brings report one change', () => {
	const { increment } = mountArrows('min="0" max="100" value="10"');
	const events = recordEvents(document.body);

	pointerAt(increment, 'pointerdown');
	pointerAt(increment, 'pointerup');
	pointerAt(increment, 'lostpointercapture');

	expect(events).toEqual(['input', 'change']);
});

test('another pointer lifting leaves a hold running', () => {
	const { increment, number } = mountArrows('min="0" max="100" value="10"');

	pointerAt(increment, 'pointerdown');
	pointerAt(increment, 'pointerup', { pointerId: 2 });
	vi.advanceTimersByTime(400);

	expect(number.value).toBe(12);
});

test('a secondary button on an arrow does nothing', () => {
	const { increment, number } = mountArrows('min="0" max="100" value="10"');

	pointerAt(increment, 'pointerdown', { button: 2 });
	vi.advanceTimersByTime(1000);

	expect(number.value).toBe(10);
});

test('a long press on an arrow opens no menu', () => {
	const { increment } = mountArrows('min="0" max="100" value="10"');
	const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

	increment.dispatchEvent(menu);

	expect(menu.defaultPrevented).toBe(true);
});

test('an arrow on a box moved to another parent steps once a press', async () => {
	const { increment, number } = mountArrows('min="0" max="100" value="10"');
	const parent = document.createElement('div');

	document.body.append(parent);
	number.remove();
	await Promise.resolve();
	parent.append(number);
	pointerAt(increment, 'pointerdown');

	expect(number.value).toBe(11);
});

test('an accelerated hold lands on the detent before it passes', () => {
	const { increment, number } = mountArrows('detent="50" min="0" max="100" value="20"');
	const landed: Array<number> = [];

	document.body.addEventListener('input', () => {
		landed.push(number.value);
	});
	pointerAt(increment, 'pointerdown');
	vi.advanceTimersByTime(3640);

	// At four steps a repeat the hold reaches 48 and would go on to 52
	expect(landed).toContain(50);
	expect(number.value).toBeGreaterThan(50);
});

test('a hold that missed its release ends at the next press, on an arrow or the digits', () => {
	const { control, increment, number } = mountArrows('min="0" max="100" value="10"');
	const changes: Array<number> = [];

	document.body.addEventListener('change', () => {
		changes.push(number.value);
	});
	pointerAt(increment, 'pointerdown');
	pointerAt(increment, 'pointerdown');
	expect(number.value).toBe(12);

	pointerAt(control, 'pointerdown', { clientY: 100 });
	pointerAt(control, 'pointermove', { clientY: 60 });
	vi.advanceTimersByTime(1000);

	expect(changes).toEqual([11, 12]);
	expect(number.value).toBeGreaterThan(12);
});

test('the box ignores its keys while an arrow is held', () => {
	const { control, increment, number } = mountArrows('min="0" max="100" value="10"');

	pointerAt(increment, 'pointerdown');
	control.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }),
	);
	control.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }),
	);

	expect(number.value).toBe(11);
	expect(control.querySelector('input')?.hidden).toBe(true);
});

test('a host write during a hold is dropped, and the hold steps on from its own value', () => {
	const { increment, number } = mountArrows('min="0" max="100" step="2" value="10"');

	pointerAt(increment, 'pointerdown');
	number.value = 60;
	number.setAttribute('value', '70');
	vi.advanceTimersByTime(400);
	pointerAt(increment, 'pointerup');

	expect(number.value).toBe(14);
});

test('a press on an arrow never starts a drag', () => {
	const { control, increment, number } = mountArrows('min="0" max="300" step="0.5" value="100"');

	pointerAt(increment, 'pointerdown', { clientY: 100 });
	pointerAt(control, 'pointermove', { clientY: 20 });
	pointerAt(control, 'pointerup', { clientY: 20 });

	expect(number.value).toBe(100.5);
});

test('an arrow on a disabled box does nothing', () => {
	const { decrement, number } = mountArrows('disabled min="0" max="100" value="10"');
	const events = recordEvents(document.body);

	pointerAt(decrement, 'pointerdown');
	vi.advanceTimersByTime(1000);

	expect(number.value).toBe(10);
	expect(events).toEqual([]);
});
