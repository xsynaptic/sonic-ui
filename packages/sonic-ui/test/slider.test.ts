import { expect, test } from 'vitest';

// @vitest-environment happy-dom
import type { SonicSlider } from '#elements/slider.ts';

import '#define/slider.ts';

function mountSlider(attributes: string): { control: HTMLElement; slider: SonicSlider } {
	document.body.innerHTML = `<sonic-slider ${attributes}></sonic-slider>`;

	const slider = document.querySelector('sonic-slider');
	const control = slider?.querySelector<HTMLElement>('.sonic-slider');
	if (!slider || !control) throw new Error('The slider did not render');

	return { control, slider };
}

test('orientation follows the attribute', () => {
	const { control, slider } = mountSlider('value="40"');

	expect(control.getAttribute('aria-orientation')).toBe('horizontal');

	slider.setAttribute('orientation', 'vertical');
	expect(control.getAttribute('aria-orientation')).toBe('vertical');
});

test.each([
	['notched max="10"', '11'],
	['notched step="0"', ''],
	['max="10"', ''],
])('%s sets the mark count to "%s"', (attributes, expected) => {
	const { control } = mountSlider(attributes);

	expect(control.style.getPropertyValue('--_sonic-slider-positions')).toBe(expected);
});

test.each([
	['origin="0"', '0.5'],
	['origin="-80"', '0'],
	['origin="80"', '1'],
	['', '0'],
])(
	'%s on a -50 to 50 slider puts the origin at %s, and moving it keeps the value',
	(attributes, expected) => {
		const { control, slider } = mountSlider(`min="-50" max="50" value="20" ${attributes}`);

		expect(control.style.getPropertyValue('--_sonic-slider-origin')).toBe(expected);

		slider.setAttribute('origin', '25');
		expect(control.style.getPropertyValue('--_sonic-slider-origin')).toBe('0.75');
		expect(slider.value).toBe(20);
	},
);

test('closing the entry restores the orientation with the slider role', () => {
	const { control } = mountSlider('orientation="vertical" value="40"');
	const entry = control.querySelector('input');
	if (!entry) throw new Error('The slider has no entry');

	for (let presses = 0; presses < 2; presses += 1) {
		const options = { bubbles: true, button: 0, clientX: 5, clientY: 5, pointerId: 1 };

		control.dispatchEvent(new PointerEvent('pointerdown', options));
		control.dispatchEvent(new PointerEvent('pointerup', options));
	}

	expect(entry.hidden).toBe(false);
	expect(control.hasAttribute('aria-orientation')).toBe(false);

	entry.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
	expect(control.getAttribute('role')).toBe('slider');
	expect(control.getAttribute('aria-orientation')).toBe('vertical');
});

// happy-dom lays nothing out, so the travel is 1px and any drag runs to the end
test.each([
	['', 100],
	['groove-press="none"', 40],
])('with %s, a drag from the groove leaves the value at %s', (attributes, expected) => {
	const { control, slider } = mountSlider(`value="40" ${attributes}`);
	const options = { bubbles: true, button: 0, clientX: 0, clientY: 0, pointerId: 1 };

	control.dispatchEvent(new PointerEvent('pointerdown', options));
	control.dispatchEvent(new PointerEvent('pointermove', { ...options, clientX: 50 }));
	control.dispatchEvent(new PointerEvent('pointerup', { ...options, clientX: 50 }));

	expect(slider.value).toBe(expected);
});

test('with groove-press="none", the cap still drags', () => {
	const { control, slider } = mountSlider('value="40" groove-press="none"');
	const cap = control.querySelector('.sonic-slider-cap');
	if (!cap) throw new Error('The slider has no cap');

	const options = { bubbles: true, button: 0, clientX: 0, clientY: 0, pointerId: 1 };

	cap.dispatchEvent(new PointerEvent('pointerdown', options));
	cap.dispatchEvent(new PointerEvent('pointermove', { ...options, clientX: 0.1 }));

	expect(slider.value).toBe(50);
});

test('with groove-press="none" and double-press="reset", a double press on the groove keeps the value', () => {
	const { control, slider } = mountSlider(
		'value="40" default="0" double-press="reset" groove-press="none"',
	);
	const options = { bubbles: true, button: 0, clientX: 0, clientY: 0, pointerId: 1 };

	for (let presses = 0; presses < 2; presses += 1) {
		control.dispatchEvent(new PointerEvent('pointerdown', options));
		control.dispatchEvent(new PointerEvent('pointerup', options));
	}

	expect(slider.value).toBe(40);
});
