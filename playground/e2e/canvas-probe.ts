import type { Locator } from '@playwright/test';

import { expect } from '@playwright/test';

type Pixel = [number, number, number, number];

// Read through a copy, so the control's own canvas is never read back and stays on the GPU
export async function canvasPixels(
	canvas: Locator,
	columns: Array<number>,
	rowFraction = 0.5,
): Promise<Array<Pixel>> {
	return canvas.evaluate(
		(element, [columns, rowFraction]) => {
			if (!(element instanceof HTMLCanvasElement)) throw new Error('Not a canvas');

			const copy = document.createElement('canvas');

			copy.width = element.width;
			copy.height = element.height;

			const context = copy.getContext('2d', { willReadFrequently: true });
			if (!context) throw new Error('No 2d context');

			context.drawImage(element, 0, 0);

			return columns.map((column): Pixel => {
				const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(
					column,
					Math.floor(element.height * rowFraction),
					1,
					1,
				).data;

				return [red, green, blue, alpha];
			});
		},
		[columns, rowFraction] as const,
	);
}

export async function paintedColour(canvas: Locator, colour: string): Promise<Pixel> {
	return canvas.evaluate((_element, fill) => {
		const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
		if (!context) throw new Error('No 2d context');

		context.fillStyle = fill;
		context.fillRect(0, 0, 1, 1);

		const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;

		return [red, green, blue, alpha] satisfies Pixel;
	}, colour);
}

// Engines differ by up to 2 a channel on the same colour
function checkPixel(check: typeof expect.soft, actual: Pixel | undefined, expected: Pixel): void {
	const isClose = actual?.every(
		(channel, index) => Math.abs(channel - (expected[index] ?? 0)) <= 2,
	);

	check(isClose, `${String(actual)} against ${String(expected)}`).toBe(true);
}

export function expectPixel(actual: Pixel | undefined, expected: Pixel): void {
	checkPixel(expect, actual, expected);
}

export function softPixel(actual: Pixel | undefined, expected: Pixel): void {
	checkPixel(expect.soft, actual, expected);
}

export async function pixelAt(canvas: Locator, x: number): Promise<Pixel | undefined> {
	const [pixel] = await canvasPixels(canvas, [x]);

	return pixel;
}

export async function alphaAt(canvas: Locator, x: number): Promise<number | undefined> {
	const pixel = await pixelAt(canvas, x);

	return pixel?.[3];
}

export function middleOf(canvas: Locator): Promise<number> {
	return canvas.evaluate((element) =>
		element instanceof HTMLCanvasElement ? Math.floor(element.width / 2) : 0,
	);
}
