import { expect, test } from 'vitest';

import { createTrackingClock } from '#lib/tracking-clock.ts';

test('a seek over half a second snaps rather than sliding through the span between', () => {
	const clock = createTrackingClock();

	clock.read(0, 10, true);

	expect(clock.read(16, 100, true)).toBe(100);
});

test('below the snap it closes 6% of the error each frame', () => {
	const clock = createTrackingClock();

	clock.read(0, 10, true);

	expect(clock.read(0, 10.2, true)).toBeCloseTo(10.012, 9);
});

test('between source reports, frame time runs the position', () => {
	const clock = createTrackingClock();

	clock.read(5000, 10, true);

	expect(clock.read(5100, 10, true)).toBeCloseTo(10.1 - 0.1 * 0.06, 9);
});

test('the gap across a pause is not time played', () => {
	const clock = createTrackingClock();

	clock.read(0, 10, true);
	clock.read(16, 10, false);

	expect(clock.read(416, 10, true)).toBe(10);
});

test('a late frame counts its own elapsed time before judging a seek', () => {
	const clock = createTrackingClock();

	clock.read(5000, 10, true);

	expect(clock.read(5300, 10.6, true)).toBeCloseTo(10.3 + 0.3 * 0.06, 9);
});
