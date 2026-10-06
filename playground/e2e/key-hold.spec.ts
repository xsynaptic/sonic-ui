import type { Locator } from '@playwright/test';

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
});

function scaleOf(cap: Locator): () => Promise<string> {
	return () => cap.evaluate((element) => getComputedStyle(element).scale);
}

const atRest = /^(1|none)$/;

test('Space holds a button’s cap down, and lifting or leaving lets it up', async ({
	browserName,
	page,
}) => {
	const scale = scaleOf(page.locator('#next .sonic-button-cap'));

	await page.locator('#next .sonic-button').focus();
	await page.keyboard.down('Space');
	await expect.poll(scale).toBe('0.985');

	await page.keyboard.up('Space');
	await expect.poll(scale).toMatch(atRest);

	// WebKit leaves `:active` on a button that focus left mid-hold, and the pointer still needs `:active`
	if (browserName === 'webkit') return;

	await page.keyboard.down('Space');
	await expect.poll(scale).toBe('0.985');
	await page.keyboard.press('Tab');
	await expect.poll(scale).toMatch(atRest);
});

test('Space holds an option’s cap down, and leaving or an arrow lets it up', async ({ page }) => {
	const option = page.getByRole('radio', { name: 'HP' });
	const scale = scaleOf(option.locator('.sonic-segmented-cap'));

	await option.focus();
	await page.keyboard.down('Space');
	await expect.poll(scale).toBe('0.985');

	await page.keyboard.press('Tab');
	await expect.poll(scale).toMatch(atRest);
	await page.keyboard.up('Space');

	await option.focus();
	await page.keyboard.down('Space');
	await expect.poll(scale).toBe('0.985');
	await page.keyboard.press('ArrowLeft');
	await expect(page.getByRole('radio', { name: 'LP' })).toBeFocused();
	await expect.poll(scale).toMatch(atRest);
});

test('Space holds a toggle’s cap down and lets it up again', async ({ page }) => {
	const scale = scaleOf(page.locator('#route .sonic-toggle-cap'));

	await page.locator('#route .sonic-toggle-position[tabindex="0"]').focus();
	await page.keyboard.down('Space');
	await expect.poll(scale).toBe('0.985');

	await page.keyboard.up('Space');
	await expect.poll(scale).toMatch(atRest);
});
