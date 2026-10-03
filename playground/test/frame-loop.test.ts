import { beforeEach, expect, test, vi } from 'vitest';

import { frameLoop } from '#scripts/frame-loop.ts';

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;

function flushFrame(time: number): void {
	const pending = [...frames.values()];

	frames.clear();
	for (const callback of pending) callback(time);
}

beforeEach(() => {
	frames.clear();
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
		nextFrame += 1;
		frames.set(nextFrame, callback);

		return nextFrame;
	});
	vi.stubGlobal('cancelAnimationFrame', (frame: number) => frames.delete(frame));
});

test('elapsed time starts at zero and clamps to a tenth of a second', () => {
	const onFrame = vi.fn();

	frameLoop(onFrame).start();
	flushFrame(1000);
	flushFrame(1016);
	flushFrame(4000);
	expect(onFrame.mock.calls).toEqual([
		[0, 1000],
		[0.016, 1016],
		[0.1, 4000],
	]);
});

test('a loop that sleeps runs again on wake, with no time carried across the sleep', () => {
	const onFrame = vi.fn((elapsedSeconds: number) => elapsedSeconds === 0);
	const loop = frameLoop(onFrame);

	loop.start();
	flushFrame(1000);
	flushFrame(1020);
	expect(frames.size).toBe(0);

	loop.wake();
	loop.wake();
	expect(frames.size).toBe(1);
	flushFrame(9000);
	expect(onFrame.mock.calls.at(-1)).toEqual([0, 9000]);
});

test('a stopped loop ignores wake until it starts again', () => {
	const onFrame = vi.fn();
	const loop = frameLoop(onFrame);

	loop.start();
	flushFrame(1000);
	loop.stop();
	loop.wake();
	expect(frames.size).toBe(0);

	loop.start();
	flushFrame(1050);
	expect(onFrame.mock.calls.at(-1)).toEqual([0, 1050]);
});
