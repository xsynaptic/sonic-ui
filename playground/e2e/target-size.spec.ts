import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { boxOf } from './pointer.ts';
import { valueNow } from './state.ts';

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
	const box = await boxOf(button.locator('.sonic-button'));

	await page.mouse.click(box.x - outsidePx, box.y + box.height / 2);
}

test(
	"a press just outside a button lands only with a target size set, and only within it, and a target size under the button's own leaves its edge pressable",
	{ tag: '@mobile' },
	async ({ page }) => {
		const { button, clicks } = await openButton(page);

		await pressBeside(page, button, 4);
		expect(await clicks()).toBe(0);

		await button.evaluate((element) => {
			element.style.setProperty('--sonic-target-size', '44px');
		});
		await pressBeside(page, button, 4);
		expect(await clicks()).toBe(1);

		await pressBeside(page, button, 8);
		expect(await clicks()).toBe(1);

		await button.evaluate((element) => {
			element.style.setProperty('--sonic-target-size', '8px');
		});
		await pressBeside(page, button, -2);
		expect(await clicks()).toBe(2);
	},
);

test(
	"a press just past a slider's breadth lands only with a target size set, and only within it; a press past its length never lands",
	{ tag: '@mobile' },
	async ({ page }) => {
		await page.goto('/fixtures/');

		const host = page.locator('#send');
		const slider = page.getByRole('slider', { name: 'Send' });

		await slider.scrollIntoViewIfNeeded();

		const box = await boxOf(slider);

		const value = (): Promise<number> => valueNow(slider);

		await page.mouse.click(box.x + box.width * 0.75, box.y - 4);
		expect(await value()).toBe(0);

		await host.evaluate((element) => {
			element.style.setProperty('--sonic-target-size', '44px');
		});
		await page.mouse.click(box.x + box.width * 0.75, box.y - 4);

		const landed = await value();

		expect(landed).toBeGreaterThan(60);

		await page.mouse.click(box.x + box.width * 0.25, box.y - 10);
		await page.mouse.click(box.x + box.width + 4, box.y + box.height / 2);
		expect(await value()).toBe(landed);
	},
);

test.describe('forced colours', () => {
	test.use({ forcedColors: 'active' });

	test('a target paints nothing', async ({ page }) => {
		const { button } = await openButton(page);

		await button.evaluate((element) => {
			element.style.setProperty('--sonic-target-size', '44px');
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
