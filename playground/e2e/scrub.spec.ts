import { expect, test } from '@playwright/test';

import { mouseOnly } from './pointer.ts';

test.skip(({ isMobile }) => isMobile, mouseOnly);

test('a scrub slider thickens its groove under the pointer without changing its box, and reads out there', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const slider = page.locator('#seek .sonic-slider');
	const groove = slider.locator('.sonic-slider-groove');

	await slider.scrollIntoViewIfNeeded();
	await expect(groove).toHaveCSS('block-size', '8px');

	const box = await slider.boundingBox();
	if (!box) throw new Error('The slider has no box');

	const pointerX = box.x + (box.width * 3) / 4;

	await page.mouse.move(pointerX, box.y + box.height / 2);
	await expect(groove).toHaveCSS('block-size', '16px');
	expect(await slider.boundingBox()).toEqual(box);

	const readout = slider.locator('.sonic-slider-readout');

	await expect(readout).toBeVisible();

	const bubble = await readout.boundingBox();

	expect(Math.abs((bubble?.x ?? 0) + (bubble?.width ?? 0) / 2 - pointerX)).toBeLessThanOrEqual(1.5);
	await expect(readout).toHaveText('225');
});

test('a scrub drag paints the stretch from the played edge in the scrub colour', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const slider = page.locator('#seek .sonic-slider');

	await slider.scrollIntoViewIfNeeded();

	const box = await slider.boundingBox();
	if (!box) throw new Error('The slider has no box');

	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 2 });

	const layers = await slider
		.locator('.sonic-slider-groove')
		.evaluate((groove) => getComputedStyle(groove).backgroundImage.split('linear-gradient').length);

	await page.mouse.up();

	const settled = await slider
		.locator('.sonic-slider-groove')
		.evaluate((groove) => getComputedStyle(groove).backgroundImage.split('linear-gradient').length);

	expect(layers - settled).toBe(1);
});
