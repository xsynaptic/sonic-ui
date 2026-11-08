import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';

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

test('a position carried over half a second past a stalled source snaps back to it', () => {
	const clock = createTrackingClock();

	clock.read(0, playing(10, 3));

	expect(clock.read(300, playing(10, 3))).toBe(10);
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

const playbackRate = fc.constantFrom(0.5, 1, 2, 3);

// Holds only for a source under 250ms and the seek threshold behind, as per-frame `currentTime` and `timeupdate` are
test.prop(
	{
		playbackRate,
		steps: fc.array(
			fc.record(
				{
					back: fc.double({ max: 0.04, min: 0, noNaN: true }),
					frame: fc.integer({ max: 250, min: 0 }),
				},
				{ noNullPrototype: true },
			),
			{ maxLength: 120, minLength: 1 },
		),
		updateMs: fc.integer({ max: 250, min: 1 }),
	},
	{ numRuns: 2000 },
)(
	'while playing, a source that reports in coarse steps and jitters back never moves the position backwards',
	({ playbackRate: rate, steps, updateMs }) => {
		const clock = createTrackingClock();
		const everyMs = Math.min(updateMs, 400 / rate);
		let frameMs = 0;
		let previous = -Infinity;

		for (const { back, frame } of steps) {
			frameMs += frame;
			const reported = 10 + ((Math.floor(frameMs / everyMs) * everyMs) / 1000) * rate - back;
			const position = clock.read(frameMs, playing(reported, rate));

			expect(position).toBeGreaterThanOrEqual(previous);
			previous = position;
		}
	},
);

interface Report {
	drift: number;
	frame: number;
	isPlaying: boolean;
	playbackRate: number;
}

interface Reading {
	carried: number;
	hadSource: boolean;
	isPlaying: boolean;
	lastSeconds: number | undefined;
	position: number;
	seconds: number;
}

const reports = fc.array(
	fc.record(
		{
			drift: fc.oneof(
				{ arbitrary: fc.double({ max: 0.6, min: -0.6, noNaN: true }), weight: 6 },
				{ arbitrary: fc.constantFrom(-3, 2), weight: 1 },
				{ arbitrary: fc.constantFrom(NaN, Infinity, -Infinity), weight: 2 },
			),
			frame: fc.integer({ max: 250, min: 0 }),
			isPlaying: fc.oneof({ arbitrary: fc.constant(true), weight: 4 }, fc.constant(false)),
			playbackRate,
		},
		{ noNullPrototype: true },
	),
	{ maxLength: 60, minLength: 1 },
);

function readAll(steps: Array<Report>): Array<Reading> {
	const clock = createTrackingClock();
	const readings: Array<Reading> = [];
	let frameMs = 0;
	let held: number | undefined;
	let lastSeconds: number | undefined;
	let wasPlaying = false;

	for (const { drift, frame, isPlaying, playbackRate: rate } of steps) {
		frameMs += frame;
		const carried = (held ?? 0) + (wasPlaying ? (frame / 1000) * rate : 0);
		const seconds = carried + drift;
		const position = clock.read(frameMs, { isPlaying, playbackRate: rate, seconds });

		readings.push({
			carried,
			hadSource: lastSeconds !== undefined,
			isPlaying,
			lastSeconds,
			position,
			seconds,
		});
		if (Number.isFinite(seconds)) lastSeconds = seconds;
		if (lastSeconds !== undefined) held = position;
		wasPlaying = isPlaying;
	}

	return readings;
}

test.prop([reports], { numRuns: 2000 })(
	'the first source, a pause, a seek and a source stepping back each land exactly on the source',
	(steps) => {
		for (const { carried, hadSource, isPlaying, lastSeconds, position, seconds } of readAll(
			steps,
		)) {
			if (!Number.isFinite(seconds)) continue;

			const isSeek = Math.abs(seconds - carried) > 0.55;
			const isStepBack = lastSeconds !== undefined && lastSeconds - seconds > 0.06;

			if (!hadSource || !isPlaying || isSeek || isStepBack) expect(position).toBe(seconds);
		}
	},
);

test.prop([reports], { numRuns: 2000 })(
	'short of a landing, the position eases from where frame time carried it toward the source, never past it',
	(steps) => {
		for (const { carried, hadSource, isPlaying, lastSeconds, position, seconds } of readAll(
			steps,
		)) {
			const isNear = Math.abs(seconds - carried) < 0.45;
			const isSteady = lastSeconds === undefined || lastSeconds - seconds < 0.04;
			if (!hadSource || !isPlaying || !isNear || !isSteady) continue;

			expect(position).toBeGreaterThanOrEqual(Math.min(carried, seconds));
			expect(position).toBeLessThanOrEqual(Math.max(carried, seconds));
		}
	},
);

test.prop([reports], { numRuns: 2000 })(
	'once a source has reported, one that is not a number is carried through by frame time and never leaves the position not a number',
	(steps) => {
		for (const { carried, hadSource, position, seconds } of readAll(steps)) {
			if (!hadSource) continue;

			expect(Number.isFinite(position)).toBe(true);
			if (!Number.isFinite(seconds)) expect(position).toBe(carried);
		}
	},
);
