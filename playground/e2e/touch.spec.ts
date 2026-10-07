import { expect, test } from '@playwright/test';

import { boxOf } from './pointer.ts';

test.skip(({ hasTouch }) => !hasTouch, 'Needs a touchscreen');

// Not `dblclick`, which iOS may not deliver under `touch-action: none`
test('a double tap opens typed entry', { tag: '@mobile' }, async ({ page }) => {
	await page.goto('/fixtures/');

	const target = page.locator('#cutoff .sonic-dial');

	// A tap outside the viewport lands nowhere
	await target.scrollIntoViewIfNeeded();

	const box = await boxOf(target);

	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;

	await page.touchscreen.tap(x, y);
	await page.touchscreen.tap(x, y);

	await expect(page.getByRole('textbox', { name: 'Cutoff' })).toBeFocused();
});

test('a double tap on a number box types in place', { tag: '@mobile' }, async ({ page }) => {
	await page.goto('/fixtures/');

	const target = page.locator('#tempo .sonic-number');

	await target.scrollIntoViewIfNeeded();

	const box = await boxOf(target);

	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;

	await page.touchscreen.tap(x, y);
	await page.touchscreen.tap(x, y);

	await expect(page.getByRole('textbox', { name: 'Tempo' })).toBeFocused();
});
