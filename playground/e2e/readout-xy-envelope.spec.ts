import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { centerOf, mouseOnly } from './pointer.ts';

test.use({ reducedMotion: 'reduce' });

test.skip(({ isMobile }) => isMobile, mouseOnly);

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
});

async function hold(page: Page, part: Locator, by: { x: number; y: number }): Promise<void> {
	await part.evaluate((element) => {
		element.scrollIntoView({ block: 'center' });
	});

	const start = await centerOf(part);

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + by.x, start.y + by.y, { steps: 4 });
}

async function expectAbove(readout: Locator, part: Locator): Promise<void> {
	await expect(readout).toBeVisible();

	const [bubble, anchor] = [await readout.boundingBox(), await part.boundingBox()];
	if (!bubble || !anchor) throw new Error('The readout or its part has no box');

	const gap = anchor.y - (bubble.y + bubble.height);

	expect(Math.abs(bubble.x + bubble.width / 2 - (anchor.x + anchor.width / 2))).toBeLessThan(1.5);
	expect(gap).toBeGreaterThanOrEqual(0);
	expect(gap).toBeLessThan(bubble.height);
}

test('the XY pad readout names both axes and stays over the puck as it moves', async ({ page }) => {
	const puck = page.locator('#xy-log .sonic-xy-puck');
	const readout = page.locator('#xy-log .sonic-xy-readout');

	await hold(page, puck, { x: 24, y: 14 });
	await expectAbove(readout, puck);
	await expect(readout).toHaveText(/^Cutoff \d+, Resonance -?[\d.]+$/);

	const first = await centerOf(puck);

	await page.mouse.move(first.x - 40, first.y - 30, { steps: 4 });

	const second = await centerOf(puck);

	expect(second.x).toBeLessThan(first.x - 20);
	await expectAbove(readout, puck);

	await page.mouse.up();
	await expect(readout).toBeHidden();
});

test('the envelope readout sits over whichever handle is held', async ({ page }) => {
	const readout = page.locator('#envelope-curves .sonic-envelope-readout');
	const decay = page.locator('#envelope-curves .sonic-envelope-handle[data-sonic-stage="decay"]');
	const attack = page.locator('#envelope-curves .sonic-envelope-handle[data-sonic-stage="attack"]');

	await hold(page, decay, { x: 16, y: 10 });
	await expectAbove(readout, decay);
	await expect(readout).toHaveText(/^\d+, 0\.\d+$/);

	await page.mouse.up();
	await expect(readout).toBeHidden();

	await hold(page, attack, { x: -12, y: 0 });
	await expectAbove(readout, attack);
	await expect(readout).toHaveText(/^\d+$/);
});
