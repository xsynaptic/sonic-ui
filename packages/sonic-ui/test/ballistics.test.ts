import { expect, test } from 'vitest';

import { ballisticsRates, fall, rise, stepNeedle } from '#lib/ballistics.ts';

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

test.each([
	['ppm-1', 5],
	['ppm-2', 10],
] as const)(
	'a %s burst as long as its integration time of %dms reads 2 dB low',
	(mode, burstMs) => {
		const level = rise(0, { target: 1, timeConstantMs: ballisticsRates[mode].riseMs }, burstMs);

		expect(20 * Math.log10(level)).toBeCloseTo(-2, 1);
	},
);

const rest = { carryMs: 0, position: 0, velocity: 0 };

function stepResponse(hertz: number): { arrival: number; peak: number } {
	const frame = 1000 / hertz;
	let needle = rest;
	let [arrival, peak] = [NaN, 0];

	for (let count = 1; count <= hertz; count += 1) {
		const before = needle.position;

		needle = stepNeedle(needle, 1, frame);
		if (Number.isNaN(arrival) && needle.position >= 0.99) {
			arrival = (count - 1 + (0.99 - before) / (needle.position - before)) * frame;
		}
		peak = Math.max(peak, needle.position);
	}

	return { arrival, peak };
}

test('a needle is 99 parts in 100 up a step near 300ms and overshoots by 1 to 1.5', () => {
	const { arrival, peak } = stepResponse(60);

	expect(arrival).toBeGreaterThan(270);
	expect(arrival).toBeLessThan(330);
	expect(peak).toBeGreaterThan(1.01);
	expect(peak).toBeLessThan(1.015);
});

test.each([30, 120, 240])('a needle at %d Hz swings as it does at 60 Hz', (hertz) => {
	const reference = stepResponse(60);
	const { arrival, peak } = stepResponse(hertz);

	expect(Math.abs(arrival - reference.arrival)).toBeLessThan(4);
	expect(peak).toBeCloseTo(reference.peak, 3);
});

test('a needle stays under its overshoot across one long frame, as a tab resuming gives', () => {
	const { position } = stepNeedle(rest, 1, 250);

	expect(position).toBeGreaterThan(0.9);
	expect(position).toBeLessThan(1.015);
});

test('a frame gap of an hour takes the steps a second does', () => {
	expect(stepNeedle(rest, 1, 3_600_000)).toEqual(stepNeedle(rest, 1, 1000));
});
