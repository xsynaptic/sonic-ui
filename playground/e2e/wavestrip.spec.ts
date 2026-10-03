import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { alphaAt, canvasPixels, expectPixel, paintedColour, pixelAt } from './canvas-probe.ts';
import { readState } from './state.ts';

// At DPR 2 the default 3px pitch and 0.33 gap make 6 device px a bar: 4 drawn, then 2 of gap
const pitch = 6;
const bar = 4;

test.use({ deviceScaleFactor: 2 });

async function openWavestrip(page: Page): Promise<{ canvas: Locator; wavestrip: Locator }> {
	await page.goto('/fixtures/');

	const wavestrip = page.locator('#wavestrip');
	const canvas = wavestrip.locator('canvas');

	// Out of view it holds its frames, and on a phone the fixture sits below the fold
	await canvas.scrollIntoViewIfNeeded();

	await expect.poll(() => alphaAt(canvas, 1)).toBe(255);

	return { canvas, wavestrip };
}

function readWidth(canvas: Locator): Promise<{ css: number; device: number }> {
	return canvas.evaluate((element) => {
		if (!(element instanceof HTMLCanvasElement)) throw new Error('Not a canvas');

		return { css: element.getBoundingClientRect().width, device: element.width };
	});
}

test('the canvas backs every device pixel, and bars and gaps land where the grid puts them', async ({
	page,
}) => {
	const { canvas } = await openWavestrip(page);
	const { css, device } = await readWidth(canvas);
	const [inBar, inGap] = await canvasPixels(canvas, [10 * pitch + 1, 10 * pitch + bar]);

	expect(Math.abs(device - css * 2)).toBeLessThanOrEqual(1);
	expect(inBar?.[3]).toBe(255);
	expect(inGap?.[3]).toBe(0);
});

test('the played side paints the lit colour and the rest the wave colour', async ({ page }) => {
	const { canvas } = await openWavestrip(page);
	const { device } = await readWidth(canvas);
	const edgeBar = Math.floor(device / 2 / pitch);
	const [played, unplayed] = await canvasPixels(canvas, [
		(edgeBar - 4) * pitch + 1,
		(edgeBar + 4) * pitch + 1,
	]);
	const lit = await canvas.evaluate((element) =>
		getComputedStyle(element).getPropertyValue('--_sonic-lit'),
	);
	const wave = await canvas.evaluate((element) =>
		getComputedStyle(element).getPropertyValue('--_sonic-wavestrip-wave'),
	);

	expectPixel(played, await paintedColour(canvas, lit));
	expectPixel(unplayed, await paintedColour(canvas, wave));
});

test('a lit colour set on an ancestor repaints within two frames', async ({ page }) => {
	const { canvas } = await openWavestrip(page);

	await page.evaluate(async () => {
		document
			.querySelector<HTMLElement>('#wavestrip-box')
			?.style.setProperty('--sonic-lit', '#0080ff');
		for (let frame = 0; frame < 2; frame += 1) {
			await new Promise((resolve) => requestAnimationFrame(resolve));
		}
	});

	expectPixel(await pixelAt(canvas, 1), [0, 128, 255, 255]);
});

test('empty peaks draw only the glass, and set the empty state', async ({ page }) => {
	const { canvas, wavestrip } = await openWavestrip(page);

	await wavestrip.evaluate((element) => {
		Object.assign(element, { peaks: [] });
	});

	await expect.poll(() => alphaAt(canvas, 1)).toBe(0);
	expect(await readState(wavestrip, 'empty')).toBe(true);
});

test('the hover readout opens over the pointer', async ({ isMobile, page }) => {
	test.skip(isMobile, 'Touch shows the readout only once a drag reveals it');

	const { canvas, wavestrip } = await openWavestrip(page);
	const box = await canvas.boundingBox();
	if (!box) throw new Error('The wavestrip has no box');

	const pointerX = box.x + box.width / 4;

	await page.mouse.move(pointerX, box.y + box.height / 2);

	const readout = wavestrip.locator('.sonic-wavestrip-readout');

	await expect(readout).toBeVisible();

	const bubble = await readout.boundingBox();

	expect(Math.abs((bubble?.x ?? 0) + (bubble?.width ?? 0) / 2 - pointerX)).toBeLessThanOrEqual(1.5);
});
