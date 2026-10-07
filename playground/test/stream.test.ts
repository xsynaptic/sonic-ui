import { expect, test } from 'vitest';

import type { Track } from '#scripts/web-player/stream.ts';

import { pairsPerSecond } from '#scripts/seeded-samples.ts';
import { createStream } from '#scripts/web-player/stream.ts';

const queue: Array<Track> = [
	{ artist: 'One', durationSeconds: 25, peaks: [0.5], title: 'First' },
	{ artist: 'Two', durationSeconds: 40, peaks: [0.5], title: 'Second' },
];

function tickFor(stream: ReturnType<typeof createStream>, ticks: number, elapsedSeconds = 0.25) {
	let result = { hasLanded: false, isActive: true };

	for (let tick = 0; tick < ticks; tick += 1) result = stream.tick(elapsedSeconds);

	return result;
}

function hasSamples(samples: Int8Array, [from, to]: [number, number]): boolean {
	return samples
		.subarray(Math.ceil(from * pairsPerSecond) * 2, Math.floor(to * pairsPerSecond) * 2)
		.some((sample) => sample !== 0);
}

test('a seek past the buffer waits out the latency, then fills ahead and merges', () => {
	const stream = createStream(queue);

	stream.play();
	stream.pause();
	stream.seek(6);
	expect(stream.state.buffered).toEqual([
		[0, 0],
		[6, 6],
	]);

	tickFor(stream, 1, 0.8);
	tickFor(stream, 2);
	expect(stream.state.buffered).toEqual([
		[0, 0],
		[6, 8],
	]);

	stream.seek(0);
	tickFor(stream, 6);
	expect(stream.state.buffered).toEqual([[0, 8]]);

	expect(tickFor(stream, 16).isActive).toBe(true);
	expect(tickFor(stream, 1).isActive).toBe(false);
	expect(stream.state.buffered).toEqual([[0, 25]]);
});

test('playing waits for two seconds of buffer, or what is left of the track', () => {
	const stream = createStream(queue);

	stream.play();
	tickFor(stream, 1, 0.8);
	tickFor(stream, 1);
	expect(stream.state).toMatchObject({ isWaiting: true, positionSeconds: 0 });

	tickFor(stream, 2);
	expect(stream.state).toMatchObject({ isWaiting: false, positionSeconds: 0.5 });

	stream.seek(24);
	tickFor(stream, 1, 0.8);
	tickFor(stream, 1);
	expect(stream.state).toMatchObject({ isWaiting: false, positionSeconds: 24.25 });
});

test('a chunk of samples lands after the latency, once, and only its own span fills', () => {
	const stream = createStream(queue);

	stream.wantSamples(0, 10);
	expect(stream.state.pending).toEqual([]);

	stream.play();
	stream.pause();
	stream.wantSamples(12, 21);
	expect(stream.state.pending).toEqual([
		[10, 20],
		[20, 30],
	]);
	expect(tickFor(stream, 1, 0.5)).toEqual({ hasLanded: false, isActive: true });

	const { samples } = stream.state;

	expect(tickFor(stream, 1, 0.5).hasLanded).toBe(true);
	expect(stream.state.pending).toEqual([]);
	expect(hasSamples(samples, [10, 20])).toBe(true);
	expect(hasSamples(samples, [0, 10])).toBe(false);

	stream.wantSamples(15, 18);
	expect(stream.state.pending).toEqual([]);
});

test('the end of a track plays the next; the end of the queue stops and plays again from zero', () => {
	const stream = createStream(queue);

	stream.play();
	stream.seek(24);
	tickFor(stream, 1, 0.8);
	tickFor(stream, 4);
	expect(stream.state).toMatchObject({
		isPlaying: true,
		positionSeconds: 0,
		track: { title: 'Second' },
	});

	stream.seek(39.5);
	tickFor(stream, 1, 0.8);
	tickFor(stream, 3);
	expect(stream.state).toMatchObject({ canNext: false, isPlaying: false, positionSeconds: 40 });

	stream.play();
	expect(stream.state).toMatchObject({ isPlaying: true, positionSeconds: 0 });
});

test('previous restarts the track past three seconds, and loads the one before at three', () => {
	const stream = createStream(queue);

	expect(stream.state).toMatchObject({ canNext: false, canPrevious: false });
	stream.play();
	stream.next();
	stream.seek(3.5);
	stream.previous();
	expect(stream.state).toMatchObject({ positionSeconds: 0, track: { title: 'Second' } });

	stream.seek(3);
	stream.previous();
	expect(stream.state).toMatchObject({
		canNext: true,
		canPrevious: false,
		positionSeconds: 0,
		track: { title: 'First' },
	});

	stream.seek(-5);
	expect(stream.state.positionSeconds).toBe(0);
	stream.seek(90);
	expect(stream.state).toMatchObject({ canPrevious: true, positionSeconds: 25 });
});
