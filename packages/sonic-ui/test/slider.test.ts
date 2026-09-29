import { expect, test, vi } from 'vitest';

import type { SonicSlider } from '#elements/slider.ts';

import '#define/slider.ts';

import { pressKey, recordEvents } from './helpers.ts';

function mountSlider(attributes: string): { control: HTMLElement; slider: SonicSlider } {
	document.body.innerHTML = `<sonic-slider ${attributes}></sonic-slider>`;

	const slider = document.querySelector('sonic-slider');
	const control = slider?.querySelector<HTMLElement>('.sonic-slider');
	if (!slider || !control) throw new Error('The slider did not render');

	return { control, slider };
}

function capOf(control: HTMLElement): HTMLElement {
	const cap = control.querySelector<HTMLElement>('.sonic-slider-cap');
	if (!cap) throw new Error('The slider has no cap');

	return cap;
}

function layOut(control: HTMLElement, track: DOMRect, capBox: DOMRect): void {
	vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(track);
	vi.spyOn(capOf(control), 'getBoundingClientRect').mockReturnValue(capBox);
}

function pointerAt(
	target: HTMLElement,
	type: string,
	at: { clientX?: number; clientY?: number },
): void {
	target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, ...at }));
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

test.each([
	['value="30" modulation="25"', '0.5', '0.75'],
	['value="30" modulation="-35"', '0.15', '0.5'],
	['value="70" modulation="40"', '0.9', '1'],
	['value="-10" modulation="-30"', '0', '0.1'],
])('%s lights the modulation from %s to %s', (attributes, from, to) => {
	const { control } = mountSlider(`min="-20" max="80" step="5" ${attributes}`);

	expect(control.style.getPropertyValue('--_sonic-slider-modulation-from')).toBe(from);
	expect(control.style.getPropertyValue('--_sonic-slider-modulation-to')).toBe(to);
});

test('a tapered slider places the modulation along its taper', () => {
	const { control } = mountSlider('min="20" max="20000" taper="log" value="200" modulation="1800"');

	expect(Number(control.style.getPropertyValue('--_sonic-slider-modulation-from'))).toBeCloseTo(
		1 / 3,
	);
	expect(Number(control.style.getPropertyValue('--_sonic-slider-modulation-to'))).toBeCloseTo(
		2 / 3,
	);
});

test('changing the modulation re-renders without touching the value', () => {
	const { control, slider } = mountSlider('min="-20" max="80" step="5" value="30"');
	const events = recordEvents(slider);

	slider.modulation = -10;

	expect(slider.getAttribute('modulation')).toBe('-10');
	expect(control.style.getPropertyValue('--_sonic-slider-modulation-from')).toBe('0.4');
	expect(control.style.getPropertyValue('--_sonic-slider-modulation-to')).toBe('0.5');
	expect(slider.value).toBe(30);
	expect(events).toEqual([]);
});

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

// A 220px track at 100px with a 20px cap leaves 200px of travel, the cap's centre at 110px at the minimum
test.each([
	['', 25, 50],
	['groove-press="none"', 40, 40],
])(
	'with %s, a press a quarter along the groove leaves the value at %d, and dragging a quarter further at %d',
	(attributes, pressed, dragged) => {
		const { control, slider } = mountSlider(`value="40" ${attributes}`);

		layOut(control, new DOMRect(100, 0, 220, 40), new DOMRect(0, 0, 20, 40));
		pointerAt(control, 'pointerdown', { clientX: 160 });
		expect(slider.value).toBe(pressed);

		pointerAt(control, 'pointermove', { clientX: 210 });
		pointerAt(control, 'pointerup', { clientX: 210 });
		expect(slider.value).toBe(dragged);
	},
);

test('with groove-press="none", the cap still drags', () => {
	const { control, slider } = mountSlider('value="40" groove-press="none"');
	const cap = capOf(control);

	layOut(control, new DOMRect(100, 0, 220, 40), new DOMRect(180, 0, 20, 40));
	pointerAt(cap, 'pointerdown', { clientX: 190 });
	expect(slider.value).toBe(40);

	pointerAt(cap, 'pointermove', { clientX: 210 });
	expect(slider.value).toBe(50);
});

// The track's bottom is 320px down, so the cap's centre sits at 310px at the minimum and travel runs upward
test('a vertical slider jumps to a groove press a quarter up and drags upward', () => {
	const { control, slider } = mountSlider('orientation="vertical" value="80"');

	layOut(control, new DOMRect(0, 100, 40, 220), new DOMRect(0, 0, 40, 20));
	pointerAt(control, 'pointerdown', { clientY: 260 });
	expect(slider.value).toBe(25);

	pointerAt(control, 'pointermove', { clientY: 210 });
	expect(slider.value).toBe(50);
});

test('a vertical slider drags from its cap by the travel left beside the cap', () => {
	const { control, slider } = mountSlider('orientation="vertical" value="40"');
	const cap = capOf(control);

	layOut(control, new DOMRect(0, 100, 40, 220), new DOMRect(0, 220, 40, 20));
	pointerAt(cap, 'pointerdown', { clientY: 230 });
	pointerAt(cap, 'pointermove', { clientY: 250 });

	expect(slider.value).toBe(30);
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

test('groove-press reads jump while unset, and jump is a valid value', () => {
	const { control, slider } = mountSlider('value="40" groove-press="none"');

	slider.groovePress = slider.groovePress === 'none' ? 'jump' : 'none';
	expect(slider.getAttribute('groove-press')).toBe('jump');

	layOut(control, new DOMRect(100, 0, 220, 40), new DOMRect(0, 0, 20, 40));
	pointerAt(control, 'pointerdown', { clientX: 160 });
	expect(slider.value).toBe(25);
});

test('orientation set as a property turns the slider', () => {
	const { control, slider } = mountSlider('value="40"');

	slider.orientation = 'vertical';
	expect(control.getAttribute('aria-orientation')).toBe('vertical');

	slider.orientation = undefined;
	expect(slider.hasAttribute('orientation')).toBe(false);
	expect(control.getAttribute('aria-orientation')).toBe('horizontal');
});

test('focus() reaches the control', () => {
	const { control, slider } = mountSlider('value="40"');

	slider.focus();
	expect(document.activeElement).toBe(control);
});

// A 220px track at 100px with a 20px cap: 200px of travel, the centre of a -50 to 50 slider at 210px
test.each([
	['origin="0"', 0],
	['', -50],
])(
	'with spring and %s, letting go reports the bent value, then the spring back to %d',
	(attributes, rest) => {
		const { control, slider } = mountSlider(
			`spring min="-50" max="50" value="${String(rest)}" ${attributes}`,
		);
		const events = recordEvents(slider);
		const values: Array<number> = [];

		slider.addEventListener('change', () => {
			values.push(slider.value);
		});
		layOut(control, new DOMRect(100, 0, 220, 40), new DOMRect(0, 0, 20, 40));
		pointerAt(capOf(control), 'pointerdown', { clientX: 210 + rest * 2 });
		pointerAt(capOf(control), 'pointermove', { clientX: 250 + rest * 2 });
		pointerAt(capOf(control), 'pointerup', { clientX: 250 + rest * 2 });

		expect(events).toEqual(['input', 'change', 'input', 'change']);
		expect(values).toEqual([rest + 20, rest]);
		expect(slider.value).toBe(rest);
	},
);

test('with spring, an arrow bends while held and springs back on keyup, and Enter types nothing', () => {
	const { control, slider } = mountSlider(
		'spring min="-50" max="50" step="5" origin="0" value="0"',
	);
	const entry = control.querySelector('input');

	pressKey(control, 'ArrowUp');
	pressKey(control, 'ArrowUp');
	expect(slider.value).toBe(10);

	control.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowUp' }));
	expect(slider.value).toBe(0);

	expect(pressKey(control, 'Enter').defaultPrevented).toBe(false);
	expect(entry?.hidden).toBe(true);
});

test('with spring and a value list, the slider springs back to the first entry', () => {
	const { control, slider } = mountSlider('spring values="-12 -6 0 6" value="-12"');

	pressKey(control, 'ArrowUp');
	expect(slider.value).toBe(-6);

	control.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowUp' }));
	expect(slider.value).toBe(-12);
});

function bufferedStops(control: HTMLElement): Array<string> {
	const ranges = control.style.getPropertyValue('--_sonic-slider-buffered-ranges');

	// Each edge is written twice, closing one stop and opening the next
	return [
		...new Set(
			[...ranges.matchAll(/(\d+%)|calc\(([\d.]+) \*/g)].map((match) => match[1] ?? match[2] ?? ''),
		),
	];
}

test('buffered pairs light the groove at their places along the travel, sorted', () => {
	const { control, slider } = mountSlider('min="10" max="110" value="10"');

	slider.buffered = [
		[60, 85],
		[10, 35],
	];

	expect(bufferedStops(control)).toEqual(['0%', '0.25', '0.5', '0.75']);
	expect(slider.buffered).toEqual([
		[10, 35],
		[60, 85],
	]);

	slider.max = 210;
	expect(bufferedStops(control)).toEqual(['0%', '0.125', '0.25', '0.375']);
});

test('buffered takes TimeRanges as a media element gives them, and undefined clears it', () => {
	const { control, slider } = mountSlider('min="10" max="110" value="10"');
	const ranges = [[35, 140]];

	slider.buffered = {
		end: (index: number) => ranges[index]?.[1] ?? NaN,
		length: ranges.length,
		start: (index: number) => ranges[index]?.[0] ?? NaN,
	};
	expect(bufferedStops(control)).toEqual(['0.25', '100%']);

	slider.buffered = undefined;
	expect(control.style.getPropertyValue('--_sonic-slider-buffered-ranges')).toBe('');
});
