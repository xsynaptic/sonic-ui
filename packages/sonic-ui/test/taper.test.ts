import { expect, test, vi } from 'vitest';

import type { SonicSlider } from '#elements/slider.ts';

import '#define/dial.ts';
import '#define/slider.ts';
import { logTaper, skewTaper } from '#lib/taper.ts';

import { mountDial, pressKey } from './helpers.ts';

function renderedFraction(control: HTMLElement): number {
	return Number(control.style.getPropertyValue('--_sonic-dial-value'));
}

test('a 20 Hz to 20 kHz skew through 1 kHz puts 68 Hz and 5.7 kHz at the quarters', () => {
	const taper = skewTaper(20, 20_000, 1000);

	expect(taper?.position(1000)).toBeCloseTo(0.5, 12);
	expect(taper?.value(0.25)).toBeCloseTo(68, 0);
	expect(taper?.value(0.75)).toBeCloseTo(5700, -2);
});

test('a 20 Hz to 20 kHz log taper puts 632 Hz at the middle', () => {
	expect(logTaper(20, 20_000)?.value(0.5)).toBeCloseTo(632, 0);
});

test.each([
	['skew', skewTaper(0, 2, 0.1)],
	['log', logTaper(20, 20_000)],
])('a %s taper round-trips across the range', (_case, taper) => {
	for (let position = 0; position <= 1; position += 0.125) {
		expect(taper?.position(taper.value(position))).toBeCloseTo(position, 12);
	}
});

test.each([
	['at min', 0],
	['at max', 100],
	['outside the range', 150],
	['at the centre', 50],
	['missing', NaN],
])('a midpoint %s takes no skew', (_case, midpoint) => {
	expect(skewTaper(0, 100, midpoint)).toBeUndefined();
});

test.each([
	[0, 100],
	[-10, 100],
	[50, 50],
])('a log taper from %d to %d is impossible', (min, max) => {
	expect(logTaper(min, max)).toBeUndefined();
});

test('the midpoint renders at half the travel, and the value and its text stay in value units', () => {
	const { control, dial } = mountDial('min="20" max="20000" midpoint="1000" value="1000"');

	expect(renderedFraction(control)).toBeCloseTo(0.5, 9);
	expect(dial.value).toBe(1000);
	expect(control.getAttribute('aria-valuenow')).toBe('1000');
});

test.each([
	['an invalid midpoint', 'midpoint="200"', 0.3],
	['a notched control', 'midpoint="10" notched', 0.3],
	['a log taper reaching zero', 'taper="log"', 0.3],
	['a log taper reaching zero, with a midpoint', 'taper="log" midpoint="25"', Math.sqrt(0.3)],
])('%s falls back as it should', (_case, attributes, expected) => {
	const { control } = mountDial(`value="30" ${attributes}`);

	expect(renderedFraction(control)).toBeCloseTo(expected, 9);
});

test('taper="log" wins over a midpoint where the range allows it', () => {
	const { control } = mountDial('min="1" max="10000" taper="log" midpoint="5000" value="100"');

	expect(renderedFraction(control)).toBeCloseTo(0.5, 9);
});

test('a drag over half the travel from min lands on the midpoint', () => {
	const { control, dial } = mountDial('min="20" max="20000" midpoint="1000" value="20"');
	const pointer = { bubbles: true, button: 0, clientX: 10, pointerId: 1 };

	// happy-dom computes no styles, so the travel is the dial's 160px fallback
	control.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientY: 100 }));
	control.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientY: 20 }));

	expect(dial.value).toBe(1000);
});

test('a press on the groove at the centre lands on the midpoint', () => {
	document.body.innerHTML =
		'<sonic-slider min="20" max="20000" midpoint="1000" value="20"></sonic-slider>';

	const slider = document.querySelector<SonicSlider>('sonic-slider');
	const control = slider?.querySelector<HTMLElement>('.sonic-slider');
	const cap = slider?.querySelector<HTMLElement>('.sonic-slider-cap');
	if (!slider || !control || !cap) throw new Error('The slider did not render');

	vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 220, 20));
	vi.spyOn(cap, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 20, 20));
	control.dispatchEvent(
		new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 110, pointerId: 1 }),
	);

	expect(slider.value).toBe(1000);
});

// With a midpoint of 25 on 0 to 100, the value is 100 times the square of the place along the travel
test.each([
	['ArrowUp', 25, 26],
	['ArrowDown', 25, 24],
	['PageUp', 25, 36],
	['PageDown', 25, 16],
	['ArrowUp', 0, 1],
	['Home', 25, 0],
	['End', 25, 100],
])('%s moves a tapered dial at %d to %d', (key, from, expected) => {
	const { control, dial } = mountDial(`midpoint="25" value="${String(from)}"`);

	pressKey(control, key);
	expect(dial.value).toBe(expected);
});

// At 0.25 on a midpoint of 25, a hundredth of the travel either way snaps back to 0.25
test.each([
	['ArrowUp', 0.5],
	['ArrowDown', 0],
])('%s moves a tapered dial stepping by 0.25 at least one step, to %s', (key, expected) => {
	const { control, dial } = mountDial('midpoint="25" step="0.25" value="0.25"');

	pressKey(control, key);
	expect(dial.value).toBe(expected);
});

test('the keys on a log taper move by the travel, snapped to the step', () => {
	const { control, dial } = mountDial('min="1" max="10000" taper="log" value="100"');

	pressKey(control, 'PageUp');
	expect(dial.value).toBe(251);

	dial.value = 100;
	pressKey(control, 'ArrowUp');
	expect(dial.value).toBe(110);
});

test('a midpoint at the centre is linear, so each arrow moves one step', () => {
	const { control, dial } = mountDial('min="20" max="20000" midpoint="10010" value="1000"');

	pressKey(control, 'ArrowUp');
	expect(dial.value).toBe(1001);
});
