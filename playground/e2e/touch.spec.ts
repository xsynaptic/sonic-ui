import { expect, test } from '@playwright/test';

test.skip(({ hasTouch }) => !hasTouch, 'Needs a touchscreen');

// Not `dblclick`, which iOS may not deliver under `touch-action: none`
test('a double tap opens typed entry', async ({ page }) => {
	await page.goto('/fixtures/');

	const box = await page.locator('#cutoff .sonic-dial').boundingBox();
	if (!box) throw new Error('The dial has no box');

	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;

	await page.touchscreen.tap(x, y);
	await page.touchscreen.tap(x, y);

	await expect(page.getByRole('textbox', { name: 'Cutoff' })).toBeFocused();
});
