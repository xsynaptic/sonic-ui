import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
});

function checkedPosition(page: Page): Promise<null | string> {
	return page
		.locator('#talk [aria-checked="true"]')
		.evaluate((position) => position.textContent.trim());
}

test('a named lever is a radio group of its printed positions, and a bare one a switch', async ({
	page,
}) => {
	await expect(page.getByRole('radiogroup', { name: 'Talk' })).toBeVisible();
	await expect(page.getByRole('radio', { checked: true, name: 'Off' })).toBeVisible();
	await expect(page.getByRole('radio', { name: 'Duck' })).toBeVisible();
	await expect(page.getByRole('switch', { checked: false, name: 'Sync' })).toBeVisible();
});

test('a trusted press holds the momentary position and a release springs it back', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, 'Touch has its own spec');

	const box = await page.getByRole('radio', { name: 'Duck' }).boundingBox();
	if (!box) throw new Error('Duck has no box');

	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	expect(await checkedPosition(page)).toBe('Duck');
	await expect(page.locator('#talk')).toHaveJSProperty('value', 'duck');

	await page.mouse.move(box.x + box.width / 2, box.y + box.height * 4, { steps: 3 });
	expect(await checkedPosition(page)).toBe('Duck');

	await page.mouse.up();
	expect(await checkedPosition(page)).toBe('Off');
});

test('a held arrow holds the momentary position until the key lifts', async ({ page }) => {
	await page.getByRole('radio', { name: 'Off' }).focus();
	await page.keyboard.down('ArrowUp');
	await expect(page.getByRole('radio', { name: 'Duck' })).toBeFocused();
	expect(await checkedPosition(page)).toBe('Duck');

	await page.keyboard.up('ArrowUp');
	await expect(page.getByRole('radio', { name: 'Off' })).toBeFocused();
	expect(await checkedPosition(page)).toBe('Off');
});

test('the bat moves toward the checked position', async ({ page }) => {
	const ballOffset = (): Promise<string> =>
		page
			.locator('#talk .sonic-lever-bat')
			.evaluate((bat) => getComputedStyle(bat, '::after').translate);

	expect(await ballOffset()).toMatch(/^0px( 0px)?$/);

	await page.getByRole('radio', { name: 'On' }).click();
	await expect.poll(ballOffset).toMatch(/^0px [1-9]/);
});
