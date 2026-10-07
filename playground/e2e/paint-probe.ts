import type { Locator, Page } from '@playwright/test';

import { expect } from '@playwright/test';

import { boxOf } from './pointer.ts';

type Colour = [number, number, number];

interface PaintedLine {
	lengthPx: number;
	pixels: Array<Colour>;
}

function pixelLine(
	page: Page,
	shot: Buffer,
	{ across, axis }: { across: number; axis: 'x' | 'y' },
): Promise<Array<Colour>> {
	return page.evaluate(
		async ([data, axis, across]) => {
			const image = new Image();

			image.src = `data:image/png;base64,${data}`;
			await image.decode();

			const canvas = document.createElement('canvas');

			canvas.width = image.naturalWidth;
			canvas.height = image.naturalHeight;

			const context = canvas.getContext('2d', { willReadFrequently: true });
			if (!context) throw new Error('No 2d context');

			context.drawImage(image, 0, 0);

			const { height, width } = canvas;
			const { data: line } =
				axis === 'x'
					? context.getImageData(0, Math.floor(height * across), width, 1)
					: context.getImageData(Math.floor(width * across), 0, 1, height);

			return Array.from({ length: line.length / 4 }, (_pixel, index): [number, number, number] => [
				line[index * 4] ?? 0,
				line[index * 4 + 1] ?? 0,
				line[index * 4 + 2] ?? 0,
			]);
		},
		[shot.toString('base64'), axis, across] as const,
	);
}

// Screenshotted rather than read from styles, so the masks and gradients are the engine's own
export async function paintedLine(
	target: Locator,
	axis: 'x' | 'y',
	across = 0.5,
): Promise<PaintedLine> {
	const shot = await target.screenshot();
	const box = await boxOf(target);

	const pixels = await pixelLine(target.page(), shot, { across, axis });

	return { lengthPx: axis === 'x' ? box.width : box.height, pixels };
}

export function paintedRuns(
	{ lengthPx, pixels }: PaintedLine,
	isPainted: (colour: Colour) => boolean,
): Array<[number, number]> {
	const scale = lengthPx / pixels.length;
	const runs: Array<[number, number]> = [];
	let from: number | undefined;

	for (const [index, colour] of [...pixels, undefined].entries()) {
		const isIn = colour !== undefined && isPainted(colour);

		if (isIn && from === undefined) from = index;
		if (isIn || from === undefined) continue;

		runs.push([from * scale, index * scale]);
		from = undefined;
	}

	return runs;
}

type Check = typeof expect.soft;

// A screenshot rounds its box out to whole pixels, and an edge antialiases across one more
function checkEdge(check: Check, actual: number | undefined, expected: number): void {
	const distance = Math.abs((actual ?? NaN) - expected);

	check(distance, `${String(actual)} against ${String(expected)}`).toBeLessThanOrEqual(1.5);
}

function checkRuns(
	check: Check,
	actual: Array<[number, number]>,
	expected: Array<[number, number]>,
): void {
	check(actual).toHaveLength(expected.length);

	for (const [index, [from, to]] of expected.entries()) {
		checkEdge(check, actual[index]?.[0], from);
		checkEdge(check, actual[index]?.[1], to);
	}
}

export function expectEdge(actual: number | undefined, expected: number): void {
	checkEdge(expect, actual, expected);
}

export function softEdge(actual: number | undefined, expected: number): void {
	checkEdge(expect.soft, actual, expected);
}

export function expectRuns(
	actual: Array<[number, number]>,
	expected: Array<[number, number]>,
): void {
	checkRuns(expect, actual, expected);
}

export function softRuns(actual: Array<[number, number]>, expected: Array<[number, number]>): void {
	checkRuns(expect.soft, actual, expected);
}
