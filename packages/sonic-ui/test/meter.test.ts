import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { SonicMeter } from '#elements/meter.ts';

import '#define/meter.ts';

// Fake timers drive `requestAnimationFrame` and `performance.now()` from one clock, a frame every 16ms
beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	document.body.replaceChildren();
	vi.useRealTimers();
});

function mountMeter(attributes = ''): { control: HTMLElement; meter: SonicMeter } {
	document.body.innerHTML = `<sonic-meter ${attributes}></sonic-meter>`;

	const meter = document.querySelector('sonic-meter');
	const control = meter?.querySelector<HTMLElement>('.sonic-meter');
	if (!meter || !control) throw new Error('The meter did not render');

	return { control, meter };
}

function read(control: HTMLElement, name: 'clipped' | 'level' | 'origin' | 'peak'): number {
	return Number(control.style.getPropertyValue(`--_sonic-meter-${name}`));
}

function fromDecibels(decibels: number): number {
	return 10 ** (decibels / 20);
}

test.each([
	['', 1, 1],
	['', fromDecibels(-30), 0.5],
	['', fromDecibels(-60), 0],
	['min="-40" max="-10"', fromDecibels(-20), 2 / 3],
	['min="-40" max="-10"', fromDecibels(-5), 1],
])('%s maps an amplitude of %f to %f of the scale', (attributes, amplitude, expected) => {
	const { control, meter } = mountMeter(attributes);

	meter.level = amplitude;

	expect(read(control, 'level')).toBeCloseTo(expected, 6);
	expect(read(control, 'peak')).toBeCloseTo(expected, 6);
});

test('a level below the scale lights nothing', () => {
	const { control, meter } = mountMeter();

	meter.level = fromDecibels(-80);
	expect(read(control, 'level')).toBe(0);

	meter.level = 0;
	expect(read(control, 'level')).toBe(0);
});

test('the attack is instant', () => {
	const { control, meter } = mountMeter();

	meter.level = fromDecibels(-50);
	meter.level = fromDecibels(-6);

	expect(read(control, 'level')).toBeCloseTo(0.9, 6);
});

test('the bar falls 20 dB a second, and the peak holds 1.5s before falling as fast', () => {
	const { control, meter } = mountMeter();

	meter.level = 1;
	meter.level = 0;

	vi.advanceTimersByTime(1000);
	expect(read(control, 'level')).toBeCloseTo(40 / 60, 2);
	expect(read(control, 'peak')).toBe(1);

	vi.advanceTimersByTime(1000);
	expect(read(control, 'level')).toBeCloseTo(20 / 60, 2);
	expect(read(control, 'peak')).toBeCloseTo(50 / 60, 1);
});

test('a steady level neither falls nor keeps the loop running', () => {
	const { control, meter } = mountMeter();

	meter.level = fromDecibels(-12);
	vi.advanceTimersByTime(3000);

	expect(read(control, 'level')).toBeCloseTo(0.8, 6);
	expect(vi.getTimerCount()).toBe(0);
});

test('reaching 0 dBFS lights the clip, which holds 1.5s and then goes out', () => {
	const { control, meter } = mountMeter();

	meter.level = 0.99;
	expect(read(control, 'clipped')).toBe(0);

	meter.level = 1.2;
	meter.level = 0.5;
	expect(read(control, 'clipped')).toBe(1);

	vi.advanceTimersByTime(1400);
	expect(read(control, 'clipped')).toBe(1);

	vi.advanceTimersByTime(200);
	expect(read(control, 'clipped')).toBe(0);
});

test('the loop stops once everything has fallen', () => {
	const { control, meter } = mountMeter();

	meter.level = 1;
	meter.level = 0;
	expect(vi.getTimerCount()).toBe(1);

	vi.advanceTimersByTime(6000);
	expect(read(control, 'level')).toBe(0);
	expect(read(control, 'peak')).toBe(0);
	expect(vi.getTimerCount()).toBe(0);
});

test('a disconnected meter stops its loop', async () => {
	const { meter } = mountMeter();

	meter.level = 1;
	meter.level = 0;
	meter.remove();
	await Promise.resolve();

	expect(vi.getTimerCount()).toBe(0);
});

test('disabled puts the light out, and enabling it again shows the level still falling', () => {
	const { control, meter } = mountMeter('disabled');

	meter.level = 1;
	expect(read(control, 'level')).toBe(0);
	expect(read(control, 'peak')).toBe(0);
	expect(read(control, 'clipped')).toBe(0);

	meter.level = fromDecibels(-60);
	vi.advanceTimersByTime(496);
	meter.disabled = false;

	expect(read(control, 'level')).toBeCloseTo(0.83, 1);
	expect(read(control, 'clipped')).toBe(1);
});

test('a scale set as properties maps the level as its attributes would', () => {
	const { control, meter } = mountMeter();

	meter.min = -40;
	meter.max = -10;
	meter.level = fromDecibels(-20);
	expect(meter.getAttribute('min')).toBe('-40');
	expect(read(control, 'level')).toBeCloseTo(2 / 3, 6);
});

test('a linear meter shows its level as given, with no fall, hold or clip', () => {
	const { control, meter } = mountMeter('scale="linear" min="-1" max="1"');

	meter.level = 0.5;
	expect(read(control, 'level')).toBe(0.75);

	meter.level = -1;
	expect(read(control, 'level')).toBe(0);
	expect(vi.getTimerCount()).toBe(0);

	meter.level = 2;
	expect(read(control, 'level')).toBe(1);
	expect(read(control, 'peak')).toBe(0);
	expect(read(control, 'clipped')).toBe(0);
});

test.each([
	['scale="linear" min="-24" max="0" origin="0"', 1],
	['scale="linear" min="-1" max="1" origin="0"', 0.5],
	['origin="-30"', 0.5],
	['origin="-90"', 0],
	['', 0],
])('%s puts the origin at %f of the scale', (attributes, expected) => {
	const { control } = mountMeter(attributes);

	expect(read(control, 'origin')).toBe(expected);
});

test('a disabled meter from a point lights nothing, its level resting on the origin', () => {
	const { control, meter } = mountMeter('scale="linear" min="-24" max="0" origin="0" disabled');

	meter.level = -12;

	expect(read(control, 'level')).toBe(1);
});

test('a ladder lights by the thresholds reached, and the peak holds on its light', () => {
	const { control, meter } = mountMeter('lights="-3 -30 -20 -12 -6 0"');

	meter.level = fromDecibels(-10);
	expect(read(control, 'level')).toBeCloseTo(3 / 6, 6);

	meter.level = fromDecibels(-4);
	meter.level = fromDecibels(-40);
	expect(read(control, 'level')).toBeCloseTo(4 / 6, 6);

	// A second's fall takes the bar to -24 dB, past two thresholds, while the peak holds
	vi.advanceTimersByTime(1000);
	expect(read(control, 'level')).toBeCloseTo(1 / 6, 6);
	expect(read(control, 'peak')).toBeCloseTo(4 / 6, 6);
});

test('removing the lights returns the meter to its scale', () => {
	const { control, meter } = mountMeter('lights="-30 -20 -12 -6 -3 0"');

	meter.level = fromDecibels(-10);
	meter.lights = undefined;

	expect(read(control, 'level')).toBeCloseTo(50 / 60, 6);
	expect(control.style.getPropertyValue('--_sonic-meter-count')).toBe('');
});
