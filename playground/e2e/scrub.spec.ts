import { expect, test } from '@playwright/test';

import { mouseOnly } from './pointer.ts';

test.skip(({ isMobile }) => isMobile, mouseOnly);

test('a scrub slider thickens its groove under the pointer without changing its box, reads out there, and paints a drag from the played edge in the scrub colour', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const slider = page.locator('#seek .sonic-slider');
	const groove = slider.locator('.sonic-slider-groove');
	const countLayers = (): Promise<number> =>
		groove.evaluate(
			(element) => getComputedStyle(element).backgroundImage.split('linear-gradient').length,
		);

	await slider.scrollIntoViewIfNeeded();
	await expect(groove).toHaveCSS('block-size', '8px');

	const box = await slider.boundingBox();
	if (!box) throw new Error('The slider has no box');

	const pointerX = box.x + (box.width * 3) / 4;
	const middle = box.y + box.height / 2;

	await page.mouse.move(pointerX, middle);
	await expect(groove).toHaveCSS('block-size', '16px');
	expect(await slider.boundingBox()).toEqual(box);

	const readout = slider.locator('.sonic-slider-readout');

	await expect(readout).toBeVisible();

	const bubble = await readout.boundingBox();

	expect(Math.abs((bubble?.x ?? 0) + (bubble?.width ?? 0) / 2 - pointerX)).toBeLessThanOrEqual(1.5);
	await expect(readout).toHaveText('225');

	await page.mouse.move(box.x + box.width / 2, middle);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 20, middle, { steps: 2 });

	const layers = await countLayers();

	await page.mouse.up();
	expect(layers - (await countLayers())).toBe(1);
});
