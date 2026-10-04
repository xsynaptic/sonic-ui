import { expect, test } from 'vitest';

import { createTrackingClock } from '#lib/tracking-clock.ts';

function playing(
	seconds: number,
	playbackRate = 1,
): { isPlaying: boolean; playbackRate: number; seconds: number } {
	return { isPlaying: true, playbackRate, seconds };
}

function errorAfter(wallMs: number, frameMs: number): number {
	const clock = createTrackingClock();
	let position = clock.read(0, playing(10));

	for (let frame = 1; frame <= Math.round(wallMs / frameMs); frame += 1) {
		position = clock.read(frame * frameMs, playing(10.2 + (frame * frameMs) / 1000));
	}

	return 10.2 + wallMs / 1000 - position;
}

test('a seek over half a second snaps, and one under it eases', () => {
	const clock = createTrackingClock();

	clock.read(0, playing(10));
	expect(clock.read(0, playing(10.6))).toBe(10.6);

	const eased = clock.read(20, playing(11.02));

	expect(eased).toBeGreaterThan(10.62);
	expect(eased).toBeLessThan(10.7);
});

test('the same error closes alike at 30, 60 and 120 Hz', () => {
	const left = 0.2 * 0.94 ** 30;

	expect(errorAfter(500, 1000 / 30)).toBeCloseTo(left, 9);
	expect(errorAfter(500, 1000 / 60)).toBeCloseTo(left, 9);
	expect(errorAfter(500, 1000 / 120)).toBeCloseTo(left, 9);
});

test('between source reports, frame time runs the position', () => {
	const clock = createTrackingClock();

	clock.read(5000, playing(10));

	expect(clock.read(5100, playing(10))).toBeCloseTo(10.1 - 0.1 * (1 - 0.94 ** 6), 9);
});

test.each([0.5, 2, 3])(
	'a source at a playback rate of %d is tracked without lag',
	(playbackRate) => {
		const clock = createTrackingClock();
		let position = clock.read(0, playing(10, playbackRate));

		for (let frame = 1; frame <= 120; frame += 1) {
			position = clock.read(frame * 25, playing(10 + frame * 0.025 * playbackRate, playbackRate));
		}

		expect(position).toBeCloseTo(10 + 3 * playbackRate, 9);
	},
);

test('the gap across a pause is not time played', () => {
	const clock = createTrackingClock();

	clock.read(0, playing(10));
	clock.read(16, { isPlaying: false, playbackRate: 1, seconds: 10 });

	expect(clock.read(416, playing(10))).toBe(10);
});

test('a late frame counts its own elapsed time before judging a seek', () => {
	const clock = createTrackingClock();

	clock.read(5000, playing(10));

	expect(clock.read(5300, playing(10.6))).toBeCloseTo(10.3 + 0.3 * (1 - 0.94 ** 18), 9);
});

test('a seek back over half a second snaps too', () => {
	const clock = createTrackingClock();

	clock.read(0, playing(100));

	expect(clock.read(16, playing(10))).toBe(10);
});

test('a pause lands on the source, however small the error', () => {
	const clock = createTrackingClock();

	clock.read(0, playing(10));

	expect(clock.read(16, { isPlaying: false, playbackRate: 1, seconds: 10.2 })).toBe(10.2);
});

test('a seek back under half a second lands at once', () => {
	const clock = createTrackingClock();

	clock.read(0, playing(10));

	expect(clock.read(16, playing(9.7))).toBe(9.7);
});

test('a source that jitters back 5ms never pulls the position back', () => {
	const clock = createTrackingClock();
	const before = clock.read(0, playing(10));

	expect(clock.read(16, playing(9.995))).toBeGreaterThan(before);
});

test('one source report that is not a number passes, and the next one tracks', () => {
	const clock = createTrackingClock();

	clock.read(0, playing(10));

	expect(clock.read(16, playing(NaN))).toBeCloseTo(10.016, 9);
	expect(clock.read(32, playing(10.032))).toBeCloseTo(10.032, 9);
});

test('a frame timestamp that goes backwards counts as no time passed', () => {
	const clock = createTrackingClock();

	clock.read(1000, playing(10));

	expect(clock.read(900, playing(10))).toBe(10);
});
