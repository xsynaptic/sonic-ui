import { expect, test } from 'vitest';

import type { BandChannels, WaveformBands } from '#lib/waveform-bands.ts';

import { bandStrip, bandTable } from '#lib/waveform-bands.ts';

const red: BandChannels = [255, 0, 0];
const green: BandChannels = [0, 255, 0];
const blue: BandChannels = [0, 0, 255];

interface View {
	pixelsPerSecond: number;
	startSeconds: number;
	width: number;
}

function stripOf(
	bands: WaveformBands,
	colours: ReadonlyArray<BandChannels | undefined>,
	view: View,
): NonNullable<ReturnType<typeof bandStrip>> {
	const table = bandTable(bands);
	const strip = table && bandStrip(table, colours, view);
	if (!strip) throw new Error('The bands drew no strip');

	return strip;
}

// One group a frame from time zero, so a pixel's index is its frame
function pixelsOf(
	bands: WaveformBands,
	colours: ReadonlyArray<BandChannels | undefined>,
	framesPerGroup = 1,
): Array<Array<number>> {
	const { count, pixels } = stripOf(bands, colours, {
		pixelsPerSecond: bands.framesPerSecond / framesPerGroup,
		startSeconds: 0,
		width: bands.levels.length / bands.bandCount / framesPerGroup,
	});

	return Array.from({ length: count }, (_pixel, index) => [
		...pixels.subarray(index * 4, index * 4 + 4),
	]);
}

test('a window moved by a third of a group keeps every colour and shifts only x', () => {
	const framesPerSecond = 43.07;
	const levels = Uint8Array.from({ length: 2 * 400 }, (_level, index) => (index * 37) % 256);
	const bands = { bandCount: 2, framesPerSecond, levels };
	const view = { pixelsPerSecond: 10, width: 30 };
	const groupSeconds = 4 / framesPerSecond;
	const before = stripOf(bands, [red, blue], { ...view, startSeconds: 12 * groupSeconds });
	const after = stripOf(bands, [red, blue], {
		...view,
		startSeconds: (12 + 1 / 3) * groupSeconds,
	});

	expect(before.groupWidth).toBeCloseTo(40 / framesPerSecond, 9);
	expect(before.x).toBeCloseTo(-before.groupWidth, 9);
	expect(after.x).toBeCloseTo(before.x - before.groupWidth / 3, 9);
	expect(after.pixels).toEqual(before.pixels);
	expect(new Set(before.pixels).size).toBeGreaterThan(4);
});

test('two linear bands mix by level, with the strongest channel at full', () => {
	const levels = new Uint8Array([255, 51, 20, 100]);

	expect(pixelsOf({ bandCount: 2, framesPerSecond: 10, levels }, [red, blue])).toEqual([
		[255, 0, 51, 255],
		[51, 0, 255, 255],
	]);
});

test('levels in decibels are decoded to amplitude before they are summed', () => {
	const bands = { bandCount: 2, framesPerSecond: 10, minDecibels: -40 };
	const wide = new Uint16Array([65_535, 49_151]);
	// 10 ** (-40 * 0.25 / 20) of 255
	const quarterDown = 81;

	expect(pixelsOf({ ...bands, levels: wide }, [red, green])).toEqual([[255, quarterDown, 0, 255]]);
	expect(pixelsOf({ ...bands, levels: new Float32Array([1, 0.75]) }, [red, green])).toEqual([
		[255, quarterDown, 0, 255],
	]);
	expect(
		pixelsOf({ ...bands, fullScale: 100, levels: new Uint8Array([100, 75]) }, [red, green]),
	).toEqual([[255, quarterDown, 0, 255]]);
	expect(pixelsOf({ ...bands, levels: new Float32Array([1, 0, 0, 0.25]) }, [red, blue], 2)).toEqual(
		[[255, 0, 8, 255]],
	);
});

test('a minDecibels of 0 or above reads as linear', () => {
	const levels = new Uint8Array([255, 51]);

	for (const minDecibels of [0, 12]) {
		expect(
			pixelsOf({ bandCount: 2, framesPerSecond: 10, levels, minDecibels }, [red, blue]),
		).toEqual([[255, 0, 51, 255]]);
	}
});

test('a band with no colour is left out of the mix, and a group with nothing to mix stays clear', () => {
	const levels = new Uint8Array([
		0, 0, 255, 0, 128, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0,
	]);
	const colours = [red, green, undefined, blue, [0, 100, 200] as const];

	expect(pixelsOf({ bandCount: 5, framesPerSecond: 10, levels }, colours)).toEqual([
		[0, 128, 255, 255],
		[0, 0, 0, 0],
		[0, 0, 0, 0],
		[255, 0, 0, 255],
	]);
});

test('part-loaded levels tint what has landed, and a group over the end reads the frames it has', () => {
	const levels = new Uint8Array(2 * 7);

	levels.set([255, 0, 255, 0], 0);
	levels.set([0, 255], 12);

	const strip = stripOf({ bandCount: 2, framesPerSecond: 10, levels }, [red, blue], {
		pixelsPerSecond: 5,
		startSeconds: 0,
		width: 20,
	});

	expect(strip.count).toBe(4);
	expect([...strip.pixels]).toEqual([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255]);
});

test('bands that cannot be read, or with no colour set, draw as no bands', () => {
	const levels = new Uint8Array([255, 255, 255, 255]);

	for (const bandCount of [0, 1.5, -2, NaN]) {
		expect(bandTable({ bandCount, framesPerSecond: 10, levels })).toBeUndefined();
	}
	for (const framesPerSecond of [0, -10, NaN]) {
		expect(bandTable({ bandCount: 2, framesPerSecond, levels })).toBeUndefined();
	}

	const table = bandTable({ bandCount: 2, framesPerSecond: 10, levels });

	expect(
		table &&
			bandStrip(table, [undefined, undefined], { pixelsPerSecond: 10, startSeconds: 0, width: 2 }),
	).toBeUndefined();
});
