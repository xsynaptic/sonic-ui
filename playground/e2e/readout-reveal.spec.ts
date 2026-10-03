import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { mouseOnly } from './pointer.ts';

test.skip(({ isMobile }) => isMobile, mouseOnly);

test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: 0 });
	await page.goto('/fixtures/');
	await page.clock.pauseAt(60_000);
});

function readOpen(readout: Locator): Promise<boolean> {
	return readout.evaluate((element) => element.matches(':popover-open'));
}

// Whole pixels, since Firefox and WebKit round the pointer
async function pressDial(page: Page): Promise<{ x: number; y: number }> {
	const box = await page.locator('#level .sonic-dial').boundingBox();
	if (!box) throw new Error('The dial has no box');

	const start = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();

	return start;
}

test('a held press shows the readout after 250ms, until release', async ({ page }) => {
	const readout = page.locator('#level .sonic-dial-readout');

	await pressDial(page);
	expect(await readOpen(readout)).toBe(false);

	await page.clock.runFor(250);
	expect(await readOpen(readout)).toBe(true);

	await page.mouse.up();
	expect(await readOpen(readout)).toBe(false);
});

test('a 4px drag shows the readout at once', async ({ page }) => {
	const readout = page.locator('#level .sonic-dial-readout');
	const start = await pressDial(page);

	await page.mouse.move(start.x, start.y - 4);
	expect(await readOpen(readout)).toBe(true);
});

test('a key shows the readout, which hides a second after the last key', async ({ page }) => {
	const readout = page.locator('#level .sonic-dial-readout');

	await page.getByRole('slider', { name: 'Level' }).focus();
	await page.keyboard.press('ArrowUp');
	expect(await readOpen(readout)).toBe(true);

	await page.clock.runFor(900);
	await page.keyboard.press('ArrowUp');
	await page.clock.runFor(900);
	expect(await readOpen(readout)).toBe(true);

	await page.clock.runFor(100);
	expect(await readOpen(readout)).toBe(false);
});
