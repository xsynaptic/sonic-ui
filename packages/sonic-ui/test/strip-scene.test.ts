import { expect, test } from 'vitest';

import { stripBars, stripRegions } from '#lib/strip-scene.ts';

const grid = { gapRatio: 0.33, pitch: 3, radiusRatio: 0.5 };

const level = Array.from({ length: 400 }, () => 0.5);

function edgeKey(played: number, buffered: Array<[number, number]>): string {
	return stripRegions({ buffered, played: played / 3000 }, 300).key;
}

// 302 CSS px at DPR 2 is 604 device px: 100 pitches of 6 leave 4, room for one more bar once its gap is dropped
test('at DPR 2 the bars sit on whole device pixels, and the undrawn trailing gap fits one more', () => {
	const bars = stripBars(level, { dpr: 2, height: 96, width: 604 }, grid);

	expect(bars).toHaveLength(101);
	expect(bars.at(-1)).toMatchObject({ width: 4, x: 600 });
});

// 3 CSS px at 1.5 is 4.5 device px; rounding the CSS pitch first would leave the fraction
test('at DPR 1.5 the pitch rounds in device pixels', () => {
	const bars = stripBars(level, { dpr: 1.5, height: 72, width: 300 }, grid);

	expect(bars).toHaveLength(60);
	expect(bars.at(-1)).toMatchObject({ width: 3, x: 295 });
});

test('a bar is at least a pixel tall, at most the box, and centred in whole pixels', () => {
	const bars = stripBars([0, 0.5, 2], { dpr: 1, height: 47, width: 9 }, grid);

	expect(bars).toEqual([
		{ height: 1, radius: 1, width: 2, x: 0, y: 23 },
		{ height: 24, radius: 1, width: 2, x: 3, y: 12 },
		{ height: 47, radius: 1, width: 2, x: 6, y: 0 },
	]);
});

test('an edge changes the key only once it reaches the next device pixel', () => {
	expect(edgeKey(61, [])).toBe(edgeKey(63, []));
	expect(edgeKey(61, [])).not.toBe(edgeKey(70, []));
	expect(edgeKey(0, [[0, 100 / 3000]])).toBe(edgeKey(0, [[0, 104 / 3000]]));
	expect(edgeKey(0, [[0, 100 / 3000]])).not.toBe(
		edgeKey(0, [
			[0, 100 / 3000],
			[2000 / 3000, 2100 / 3000],
		]),
	);
});

test('buffered regions fill first, then played from the start, then scrub between played and the drag', () => {
	const { regions } = stripRegions(
		{
			buffered: [
				[0, 0.5],
				[0.7, 0.702],
			],
			played: 0.25,
			scrub: 0.1,
		},
		100,
	);

	expect(regions).toEqual([
		{ from: 0, kind: 'buffered', to: 50 },
		{ from: 0, kind: 'played', to: 25 },
		{ from: 10, kind: 'scrub', to: 25 },
	]);
});

test('nothing played and a scrub on the played edge fill no region', () => {
	expect(stripRegions({ buffered: [], played: 0 }, 100).regions).toEqual([]);
	expect(stripRegions({ buffered: [], played: 0.3, scrub: 0.301 }, 100).regions).toEqual([
		{ from: 0, kind: 'played', to: 30 },
	]);
});

test('a gap ratio of 1 still leaves each bar a device pixel', () => {
	const [bar] = stripBars(level, { dpr: 1, height: 48, width: 300 }, { ...grid, gapRatio: 1 });

	expect(bar?.width).toBe(1);
});

test('a peak that is not a number draws a silent bar and leaves the rest standing', () => {
	const bars = stripBars([0.5, NaN, 0.5], { dpr: 1, height: 48, width: 9 }, grid);

	expect(bars.map(({ height, y }) => [height, y])).toEqual([
		[24, 12],
		[1, 24],
		[24, 12],
	]);
});

test('no peaks, or no room for a bar, draws nothing', () => {
	expect(stripBars([], { dpr: 1, height: 48, width: 300 }, grid)).toEqual([]);
	expect(stripBars(level, { dpr: 1, height: 48, width: 0 }, grid)).toEqual([]);
});

test('a played or scrub proportion that is not a number counts as the start', () => {
	expect(stripRegions({ buffered: [], played: NaN }, 100).regions).toEqual([]);
	expect(stripRegions({ buffered: [], played: NaN, scrub: 0.2 }, 100).regions).toEqual([
		{ from: 0, kind: 'scrub', to: 20 },
	]);
	expect(stripRegions({ buffered: [], played: 0.3, scrub: NaN }, 100).regions).toEqual([
		{ from: 0, kind: 'played', to: 30 },
		{ from: 0, kind: 'scrub', to: 30 },
	]);
});
