import { expect, test } from 'vitest';

import { fall, rise, stepNeedle } from '#lib/ballistics.ts';

test.each([17, 8.5])('a fall of 20 dB in 1.7s lands on -23 dB from -3 in %fms frames', (frame) => {
	let level = -3;

	for (let time = 0; time < 1700; time += frame)
		level = fall(level, { fallDecibelsPerSecond: 20 / 1.7, floor: -60 }, frame);

	expect(level).toBeCloseTo(-23, 6);
});

test('a fall stops at its floor', () => {
	expect(fall(-58, { fallDecibelsPerSecond: 20, floor: -60 }, 500)).toBe(-60);
});

test('a rise covers 63% of the gap in one time constant, and all of it with none', () => {
	expect(rise(2, { target: 10, timeConstantMs: 5 }, 5)).toBeCloseTo(10 - 8 / Math.E, 9);
	expect(rise(2, { target: 10, timeConstantMs: 0 }, 0)).toBe(10);
});

test.each([1000 / 60, 1000 / 120])(
	'a needle reaches 99% of a step near 300ms and overshoots 1 to 1.5%, in %fms frames',
	(frame) => {
		let needle = { position: 0, velocity: 0 };
		let [arrival, peak] = [NaN, 0];

		for (let time = frame; time < 1000; time += frame) {
			needle = stepNeedle(needle, 1, frame);
			if (Number.isNaN(arrival) && needle.position >= 0.99) arrival = time;
			peak = Math.max(peak, needle.position);
		}

		expect(arrival).toBeGreaterThan(270);
		expect(arrival).toBeLessThan(330);
		expect(peak).toBeGreaterThan(1.01);
		expect(peak).toBeLessThan(1.015);
	},
);

test('a needle stays under its overshoot across one long frame, as a tab resuming gives', () => {
	const { position } = stepNeedle({ position: 0, velocity: 0 }, 1, 250);

	expect(position).toBeGreaterThan(0.9);
	expect(position).toBeLessThan(1.015);
});
