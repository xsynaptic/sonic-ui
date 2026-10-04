import { expect, test } from 'vitest';

import { frameTimeline } from '#lib/frame-timeline.ts';

const base = {
	clockSeconds: 100,
	frameMs: 0,
	isPaged: false,
	isPlaying: false,
	pending: [],
	range: [3, 300] as [number, number],
	size: { dpr: 1, height: 96, width: 490 },
	zoom: 70,
};

function at(clockSeconds: number, isPaged: boolean): [number, number] {
	const timeline = frameTimeline({ ...base, clockSeconds, isPaged });

	return [timeline.view.startSeconds, timeline.playheadAt];
}

test('the playhead sits centred, or paged on pages counted from zero rather than from the range', () => {
	expect(at(13.9, false)[0]).toBeCloseTo(10.4, 9);
	expect(at(13.9, false)[1]).toBeCloseTo(0.5, 9);
	expect(at(13.9, true)[0]).toBe(7);
	expect(at(13.9, true)[1]).toBeCloseTo(6.9 / 7, 9);
	expect(at(14.1, true)[0]).toBe(14);
	expect(at(14.1, true)[1]).toBeCloseTo(0.1 / 7, 9);
});

test('paged, a held drag carries the page with it and the ghost marks playback', () => {
	const timeline = frameTimeline({
		...base,
		clockSeconds: 12,
		held: { grabbed: { seconds: 10, startSeconds: 7 }, seconds: 9 },
		isPaged: true,
	});

	expect(timeline.view.startSeconds).toBe(6);
	expect(timeline.playheadAt).toBeCloseTo(3 / 7, 9);
	expect(timeline.ghostAt).toBeCloseTo(6 / 7, 9);
	expect(timeline.isMoving).toBe(true);
});

test('the device ratio multiplies the pixels, not the seconds a window holds', () => {
	const timeline = frameTimeline({ ...base, size: { dpr: 2, height: 192, width: 980 } });

	expect(timeline.view.pixelsPerSecond).toBe(140);
	expect(timeline.wanted).toEqual([89.5, 110.5]);
});

test('pending regions clip to the window and the range', () => {
	const timeline = frameTimeline({
		...base,
		clockSeconds: 5,
		pending: [
			[0, 4],
			[8, 20],
			[30, 40],
		],
	});

	expect(timeline.view.pending).toEqual([
		[3, 4],
		[8, 8.5],
	]);
});

test('the placeholder travels only while a pending region shows and motion is allowed', () => {
	const pending: Array<[number, number]> = [[99, 101]];
	const key = (frameMs: number, isPaged: boolean): string =>
		frameTimeline({ ...base, frameMs, isPaged, pending }).paintKey;

	expect(frameTimeline({ ...base, frameMs: 1250, pending }).view.phase).toBe(0.5);
	expect(frameTimeline({ ...base, frameMs: 1250, pending }).isMoving).toBe(true);
	expect(key(1250, false)).not.toBe(key(2500, false));
	expect(key(1250, true)).toBe(key(2500, true));
	expect(frameTimeline({ ...base, frameMs: 1250 }).isMoving).toBe(false);
});

test('the wanted region is the window and one either side, inside the range', () => {
	const wanted = (clockSeconds: number, range: [number, number]): unknown =>
		frameTimeline({ ...base, clockSeconds, range }).wanted;

	expect(wanted(100, [3, 300])).toEqual([89.5, 110.5]);
	expect(frameTimeline({ ...base, zoom: 35 }).wanted).toEqual([79, 121]);
	expect(wanted(4, [3, 300])).toEqual([3, 14.5]);
	expect(wanted(4, [3, 9])).toEqual([3, 9]);
	expect(wanted(100, [3, 50])).toBeUndefined();
});

test('a playing timeline keeps moving, and a paused one at rest does not', () => {
	expect(frameTimeline({ ...base, isPlaying: true }).isMoving).toBe(true);
	expect(frameTimeline(base).isMoving).toBe(false);
});

test('paged, a playhead exactly on a page boundary opens that page', () => {
	const timeline = frameTimeline({
		...base,
		clockSeconds: 0.3,
		isPaged: true,
		size: { dpr: 1, height: 96, width: 7 },
	});

	expect(timeline.view.startSeconds).toBeCloseTo(0.3, 9);
	expect(timeline.playheadAt).toBeCloseTo(0, 9);
});
