import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { SonicMeter } from '#elements/meter.ts';

import '#define/meter.ts';

import { mountControl } from './helpers.ts';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	document.body.replaceChildren();
	vi.useRealTimers();
});

function mountMeter(attributes = ''): { control: HTMLElement; meter: SonicMeter } {
	const { control, host } = mountControl('sonic-meter', attributes);

	return { control, meter: host };
}

function read(control: HTMLElement, name: 'bar' | 'clipped' | 'origin' | 'peak-hold'): number {
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
])('%s draws an amplitude of %f at %f of the length', (attributes, amplitude, expected) => {
	const { control, meter } = mountMeter(attributes);

	meter.level = amplitude;

	expect(read(control, 'bar')).toBeCloseTo(expected, 6);
	expect(read(control, 'peak-hold')).toBeCloseTo(expected, 6);
});

test('a level below the minimum draws nothing', () => {
	const { control, meter } = mountMeter();

	meter.level = fromDecibels(-80);
	expect(read(control, 'bar')).toBe(0);

	meter.level = 0;
	expect(read(control, 'bar')).toBe(0);
});

test('the attack is instant', () => {
	const { control, meter } = mountMeter();

	meter.level = fromDecibels(-50);
	meter.level = fromDecibels(-6);

	expect(read(control, 'bar')).toBeCloseTo(0.9, 6);
});

test('the bar falls 20 dB a second, and the peak holds 1.5s before falling as fast', () => {
	const { control, meter } = mountMeter();

	meter.level = 1;
	meter.level = 0;

	vi.advanceTimersByTime(1000);
	expect(read(control, 'bar')).toBeCloseTo(40 / 60, 2);
	expect(read(control, 'peak-hold')).toBe(1);

	vi.advanceTimersByTime(1000);
	expect(read(control, 'bar')).toBeCloseTo(20 / 60, 2);
	expect(read(control, 'peak-hold')).toBeCloseTo(50 / 60, 1);
});

test('a steady level neither falls nor keeps the loop running', () => {
	const { control, meter } = mountMeter();

	meter.level = fromDecibels(-12);
	vi.advanceTimersByTime(3000);

	expect(read(control, 'bar')).toBeCloseTo(0.8, 6);
	expect(vi.getTimerCount()).toBe(0);
});

test('reaching 0 dBFS turns the clip on, which holds 1.5s and then goes out', () => {
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
	expect(read(control, 'bar')).toBe(0);
	expect(read(control, 'peak-hold')).toBe(0);
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

test('disabled puts the bar out, and enabling it again shows the level still falling', () => {
	const { control, meter } = mountMeter('disabled');

	meter.level = 1;
	expect(read(control, 'bar')).toBe(0);
	expect(read(control, 'peak-hold')).toBe(0);
	expect(read(control, 'clipped')).toBe(0);

	meter.level = fromDecibels(-60);
	vi.advanceTimersByTime(496);
	meter.disabled = false;

	expect(read(control, 'bar')).toBeCloseTo(0.83, 1);
	expect(read(control, 'clipped')).toBe(1);
});

test('bounds set as properties map the level as their attributes would', () => {
	const { control, meter } = mountMeter();

	meter.min = -40;
	meter.max = -10;
	meter.level = fromDecibels(-20);
	expect(meter.getAttribute('min')).toBe('-40');
	expect(read(control, 'bar')).toBeCloseTo(2 / 3, 6);
});

test('a set value draws at its proportion, with no fall, hold or clip, and ignores a level write', () => {
	const { control, meter } = mountMeter('value="0.5" min="-1" max="1"');

	expect(read(control, 'bar')).toBe(0.75);

	meter.level = 1.2;
	expect(read(control, 'bar')).toBe(0.75);
	expect(read(control, 'clipped')).toBe(0);
	expect(vi.getTimerCount()).toBe(0);

	meter.value = -1;
	expect(read(control, 'bar')).toBe(0);

	meter.value = 2;
	expect(read(control, 'bar')).toBe(1);
	expect(read(control, 'peak-hold')).toBe(0);
});

test('removing the value restores the level bar', () => {
	const { control, meter } = mountMeter('value="-40" min="-40" max="-10"');

	meter.level = fromDecibels(-20);
	expect(read(control, 'bar')).toBe(0);

	meter.removeAttribute('value');
	expect(meter.value).toBeUndefined();
	expect(read(control, 'bar')).toBeCloseTo(2 / 3, 6);
});

test.each([
	['min="-24" max="0" origin="0"', 1],
	['value="0.5" min="-1" max="1" origin="0"', 0.5],
	['origin="-30"', 0.5],
	['origin="-90"', 0],
	['', 0],
])('%s puts the origin at %f of the length', (attributes, expected) => {
	const { control } = mountMeter(attributes);

	expect(read(control, 'origin')).toBe(expected);
});

test('a disabled meter with an origin draws nothing, its bar resting on the origin', () => {
	const { control, meter } = mountMeter('min="-24" max="0" origin="0" disabled');

	meter.value = -12;

	expect(read(control, 'bar')).toBe(1);
});

test('a ladder fills by the thresholds reached, and the peak holds on its segment', () => {
	const { control, meter } = mountMeter('segments="-3 -30 -20 -12 -6 0"');

	meter.level = fromDecibels(-10);
	expect(read(control, 'bar')).toBeCloseTo(3 / 6, 6);

	meter.level = fromDecibels(-4);
	meter.level = fromDecibels(-40);
	expect(read(control, 'bar')).toBeCloseTo(4 / 6, 6);

	// A second's fall takes the bar to -24 dB, past two thresholds, while the peak holds
	vi.advanceTimersByTime(1000);
	expect(read(control, 'bar')).toBeCloseTo(1 / 6, 6);
	expect(read(control, 'peak-hold')).toBeCloseTo(4 / 6, 6);
});

test('removing the segments returns the meter to its bar', () => {
	const { control, meter } = mountMeter('segments="-30 -20 -12 -6 -3 0"');

	meter.level = fromDecibels(-10);
	meter.segments = undefined;

	expect(read(control, 'bar')).toBeCloseTo(50 / 60, 6);
	expect(control.style.getPropertyValue('--_sonic-meter-count')).toBe('');
});

test.each([
	['', 26 / 60],
	['ballistics="ppm-1"', 40 / 60],
	['ballistics="ppm-2"', (60 - (24 / 2.8) * 1.7) / 60],
	['ballistics="nonsense"', 26 / 60],
])('%s falls from full scale to %f of the length in 1.7s', (attributes, expected) => {
	const { control, meter } = mountMeter(attributes);

	meter.level = 1;
	vi.advanceTimersByTime(96);
	expect(read(control, 'bar')).toBe(1);

	meter.level = 0;
	vi.advanceTimersByTime(1696);
	expect(read(control, 'bar')).toBeCloseTo(expected, 2);
});

test('a PPM rise takes a frame, and one longer than the integration time lands within its 2 dB', () => {
	const { control, meter } = mountMeter('ballistics="ppm-2"');

	meter.level = 1;
	expect(read(control, 'bar')).toBe(0);

	vi.advanceTimersByTime(16);
	expect(read(control, 'bar')).toBeGreaterThan((60 - 2) / 60);
	expect(read(control, 'bar')).toBeLessThan(1);
});

test('a stalled frame that ends the peak hold falls only for the time past the hold', () => {
	const frames: Array<FrameRequestCallback> = [];

	vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
		frames.push(frame);
	});

	const { control, meter } = mountMeter();
	const start = performance.now();

	meter.level = 1;
	meter.level = 0;
	frames.shift()?.(start + 1000);
	expect(read(control, 'peak-hold')).toBe(1);

	frames.shift()?.(start + 3000);
	expect(read(control, 'peak-hold')).toBeCloseTo(30 / 60, 6);
});

test('a VU needle swings to the level with no peak hold, then stops its loop', () => {
	const { control, meter } = mountMeter('ballistics="vu"');

	meter.level = fromDecibels(-20);
	expect(read(control, 'bar')).toBe(0);

	vi.advanceTimersByTime(160);
	expect(read(control, 'bar')).toBeGreaterThan(0.5);
	expect(read(control, 'bar')).toBeLessThan(2 / 3);
	expect(read(control, 'peak-hold')).toBe(0);

	vi.advanceTimersByTime(840);
	expect(read(control, 'bar')).toBeCloseTo(2 / 3, 6);
	expect(vi.getTimerCount()).toBe(0);
});

test('a set value ignores the ballistics and draws at once', () => {
	const { control, meter } = mountMeter('min="-1" max="1" ballistics="vu"');

	meter.value = 0.5;

	expect(read(control, 'bar')).toBe(0.75);
	expect(vi.getTimerCount()).toBe(0);
});

test('peak reports the highest level since the last reset, past the bounds', () => {
	const { control, meter } = mountMeter('min="-40" max="-10"');

	expect(meter.peak).toBe(-Infinity);

	for (const decibels of [-52, -5, -31]) meter.level = fromDecibels(decibels);
	expect(meter.peak).toBeCloseTo(-5, 9);

	vi.advanceTimersByTime(4000);
	expect(read(control, 'bar')).toBeLessThan(0.5);
	expect(meter.peak).toBeCloseTo(-5, 9);

	meter.level = NaN;
	expect(meter.peak).toBeCloseTo(-5, 9);

	meter.resetPeak();
	meter.level = fromDecibels(-52);
	expect(meter.peak).toBeCloseTo(-52, 9);
});

test('ballistics never soften the peak, and a disabled meter keeps counting', () => {
	const { meter } = mountMeter('ballistics="vu" disabled');

	meter.level = fromDecibels(-6);
	meter.level = 0;

	expect(meter.peak).toBeCloseTo(-6, 9);
});

test('peak reports the largest value while one is set, and resets when the mode changes', () => {
	const { meter } = mountMeter('min="-1" max="1"');

	meter.level = fromDecibels(-6);
	meter.value = 0.2;
	meter.value = -0.6;
	expect(meter.peak).toBe(0.2);

	meter.value = undefined;
	expect(meter.peak).toBe(-Infinity);

	meter.level = fromDecibels(-12);
	expect(meter.peak).toBeCloseTo(-12, 9);
});
