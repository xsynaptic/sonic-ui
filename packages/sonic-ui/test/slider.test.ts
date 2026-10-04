import { expect, test, vi } from 'vitest';

import type { SonicSlider } from '#elements/slider.ts';

import '#define/slider.ts';

import { mountControl, pointerAt, pressKey, recordEvents } from './helpers.ts';

function mountSlider(attributes: string): { control: HTMLElement; slider: SonicSlider } {
	const { control, host } = mountControl('sonic-slider', attributes);

	return { control, slider: host };
}

function capOf(control: HTMLElement): HTMLElement {
	const cap = control.querySelector<HTMLElement>('.sonic-slider-cap');
	if (!cap) throw new Error('The slider has no cap');

	return cap;
}

function layOut(control: HTMLElement, box: DOMRect, capBox: DOMRect): void {
	vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(box);
	vi.spyOn(capOf(control), 'getBoundingClientRect').mockReturnValue(capBox);
}

test('the slider writes its proportion, origin and position count, and moving the origin keeps the value', () => {
	const { control, slider } = mountSlider(
		'min="-50" max="50" step="10" notched origin="0" value="20"',
	);
	const style = (name: string): string => control.style.getPropertyValue(`--_sonic-slider-${name}`);

	expect([style('value'), style('origin'), style('position-count')]).toEqual(['0.7', '0.5', '11']);

	slider.setAttribute('origin', '25');
	slider.notched = false;
	expect([style('origin'), style('position-count')]).toEqual(['0.75', '']);
	expect(slider.value).toBe(20);
});

test.each([
	['value="30" modulation="25"', '0.5', '0.75'],
	['value="30" modulation="-35"', '0.15', '0.5'],
	['value="70" modulation="40"', '0.9', '1'],
	['value="-10" modulation="-30"', '0', '0.1'],
])('%s draws the modulation from %s to %s', (attributes, from, to) => {
	const { control } = mountSlider(`min="-20" max="80" step="5" ${attributes}`);

	expect(control.style.getPropertyValue('--_sonic-slider-modulation-from')).toBe(from);
	expect(control.style.getPropertyValue('--_sonic-slider-modulation-to')).toBe(to);
});

test('a tapered slider draws the modulation along its taper', () => {
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

// A 220px slider at 100px with a 20px cap leaves 200px of travel, the cap's centre at 110px at the minimum
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

test('a groove press the browser cancels to scroll returns to the value before the press', () => {
	const { control, slider } = mountSlider('value="40"');
	const events = recordEvents(slider);

	layOut(control, new DOMRect(100, 0, 220, 40), new DOMRect(0, 0, 20, 40));
	pointerAt(control, 'pointerdown', { clientX: 160 });
	expect(slider.value).toBe(25);

	pointerAt(control, 'pointercancel', { clientX: 160 });
	expect(slider.value).toBe(40);
	expect(events).toEqual(['input', 'input']);
});

test('with groove-press="none", the cap still drags', () => {
	const { control, slider } = mountSlider('value="40" groove-press="none"');
	const cap = capOf(control);

	layOut(control, new DOMRect(100, 0, 220, 40), new DOMRect(180, 0, 20, 40));
	pointerAt(cap, 'pointerdown', { clientX: 190 });
	expect(slider.value).toBe(40);

	pointerAt(cap, 'pointermove', { clientX: 210 });
	expect(slider.value).toBe(50);
});

// The slider's bottom is 320px down, so the cap's centre sits at 310px at the minimum and travel runs upward
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
	expect(mountSlider('value="40"').slider.groovePress).toBe('jump');

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

// A 220px slider at 100px with a 20px cap: 200px of travel, the centre of a -50 to 50 slider at 210px
test.each([
	['origin="0"', 0],
	['', -50],
])(
	'with spring and %s, letting go reports the held value, then the spring back to %d',
	(attributes, origin) => {
		const { control, slider } = mountSlider(
			`spring min="-50" max="50" value="${String(origin)}" ${attributes}`,
		);
		const events = recordEvents(slider);
		const values: Array<number> = [];

		slider.addEventListener('change', () => {
			values.push(slider.value);
		});
		layOut(control, new DOMRect(100, 0, 220, 40), new DOMRect(0, 0, 20, 40));
		pointerAt(capOf(control), 'pointerdown', { clientX: 210 + origin * 2 });
		pointerAt(capOf(control), 'pointermove', { clientX: 250 + origin * 2 });
		pointerAt(capOf(control), 'pointerup', { clientX: 250 + origin * 2 });

		expect(events).toEqual(['input', 'change', 'input', 'change']);
		expect(values).toEqual([origin + 20, origin]);
		expect(slider.value).toBe(origin);
	},
);

test('with spring, an arrow moves it while held and it springs back on keyup, and Enter types nothing', () => {
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

test('with spring and a list of positions, the slider springs back to the first position', () => {
	const { control, slider } = mountSlider('spring positions="-12 -6 0 6" value="-12"');

	pressKey(control, 'ArrowUp');
	expect(slider.value).toBe(-6);

	control.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowUp' }));
	expect(slider.value).toBe(-12);
});

function bufferedStops(control: HTMLElement): Array<string> {
	const regions = control.style.getPropertyValue('--_sonic-slider-buffered-regions');

	return [
		...new Set(
			[...regions.matchAll(/(\d+%)|calc\(([\d.]+) \*/g)].map((match) => match[1] ?? match[2] ?? ''),
		),
	];
}

test('buffered regions fill the groove at their proportions along the travel, sorted', () => {
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
	expect(control.style.getPropertyValue('--_sonic-slider-buffered-regions')).toBe('');
});

test('the modulation value moves the slider part, and undefined clears it', () => {
	const { control, slider } = mountSlider('min="20" max="220" value="200"');

	slider.modulationValue = 70;
	expect(control.style.getPropertyValue('--_sonic-slider-modulation-value')).toBe('0.25');

	slider.modulationValue = undefined;
	expect(control.style.getPropertyValue('--_sonic-slider-modulation-value')).toBe('');
});

test('a key repeat changes on every repeat', () => {
	const { control, slider } = mountSlider('min="10" max="310" key-step="5" value="60"');
	const events = recordEvents(document.body);

	for (let index = 0; index < 2; index += 1) {
		control.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight', repeat: true }),
		);
	}

	expect(slider.value).toBe(70);
	expect(events).toEqual(['input', 'change', 'input', 'change']);
});

test('a value past an off-grid max lands on the last step and stays there', () => {
	const { control, slider } = mountSlider('max="10" step="3" value="12"');

	expect(slider.value).toBe(9);
	expect(control.getAttribute('aria-valuemax')).toBe('9');

	slider.setAttribute('aria-label', 'Level');
	expect(slider.value).toBe(9);
});

test('with spring, an arrow held under Meta springs back when Meta lifts', () => {
	const { control, slider } = mountSlider(
		'spring min="-50" max="50" step="5" origin="0" value="0"',
	);

	control.dispatchEvent(
		new KeyboardEvent('keydown', {
			bubbles: true,
			cancelable: true,
			key: 'ArrowUp',
			metaKey: true,
		}),
	);
	expect(slider.value).toBe(5);

	control.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Meta' }));
	expect(slider.value).toBe(0);
});

test('with spring, Meta let go during a drag leaves the slider where it is held', () => {
	const { control, slider } = mountSlider('spring min="-50" max="50" origin="0" value="0"');

	layOut(control, new DOMRect(100, 0, 220, 40), new DOMRect(0, 0, 20, 40));
	pointerAt(capOf(control), 'pointerdown', { clientX: 210 });
	pointerAt(capOf(control), 'pointermove', { clientX: 250 });
	control.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Meta' }));

	expect(slider.value).toBe(20);
});

test.each([
	['entry', ''],
	['reset', 'default="20" double-press="reset"'],
])(
	'with spring and double-press="%s", a double press on the cap neither opens the entry nor resets',
	(_gesture, attributes) => {
		const { control, slider } = mountSlider(
			`spring min="-50" max="50" origin="0" value="0" ${attributes}`,
		);
		const events = recordEvents(slider);

		layOut(control, new DOMRect(100, 0, 220, 40), new DOMRect(0, 0, 20, 40));
		for (let presses = 0; presses < 2; presses += 1) {
			pointerAt(capOf(control), 'pointerdown', { clientX: 210 });
			pointerAt(capOf(control), 'pointerup', { clientX: 210 });
		}

		expect(control.querySelector('input')?.hidden).toBe(true);
		expect(slider.value).toBe(0);
		expect(events).toEqual([]);
	},
);
