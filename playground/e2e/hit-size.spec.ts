import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

async function openButton(page: Page): Promise<{ button: Locator; clicks: () => Promise<number> }> {
	await page.goto('/fixtures/');

	const button = page.locator('#next');

	await button.locator('.sonic-button').scrollIntoViewIfNeeded();

	await button.evaluate((element) => {
		element.addEventListener('click', () => {
			element.dataset.clicks = String(Number(element.dataset.clicks ?? 0) + 1);
		});
	});

	return {
		button,
		clicks: () => button.evaluate((element) => Number(element.dataset.clicks ?? 0)),
	};
}

async function pressBeside(page: Page, button: Locator, outsidePx: number): Promise<void> {
	const box = await button.locator('.sonic-button').boundingBox();
	if (!box) throw new Error('The button has no box');

	await page.mouse.click(box.x - outsidePx, box.y + box.height / 2);
}

test('a press just outside a button lands only with a hit size set, and only within it', async ({
	page,
}) => {
	const { button, clicks } = await openButton(page);

	await pressBeside(page, button, 4);
	expect(await clicks()).toBe(0);

	await button.evaluate((element) => {
		element.style.setProperty('--sonic-hit-size', '44px');
	});
	await pressBeside(page, button, 4);
	expect(await clicks()).toBe(1);

	await pressBeside(page, button, 8);
	expect(await clicks()).toBe(1);
});

test("a hit size under the button's own leaves its edge pressable", async ({ page }) => {
	const { button, clicks } = await openButton(page);

	await button.evaluate((element) => {
		element.style.setProperty('--sonic-hit-size', '8px');
	});
	await pressBeside(page, button, -2);

	expect(await clicks()).toBe(1);
});

test.describe('forced colours', () => {
	test.use({ forcedColors: 'active' });

	test('a hit area paints nothing', async ({ page }) => {
		const { button } = await openButton(page);

		await button.evaluate((element) => {
			element.style.setProperty('--sonic-hit-size', '44px');
		});

		const paint = await button.locator('.sonic-button').evaluate((element) => {
			const styles = getComputedStyle(element, '::after');

			return [
				styles.backgroundColor.endsWith(', 0)'),
				styles.backgroundImage,
				styles.borderTopWidth,
			];
		});

		expect(paint).toEqual([true, 'none', '0px']);
	});
});
