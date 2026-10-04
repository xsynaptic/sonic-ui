import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { centreOf, mouseOnly } from './pointer.ts';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
});

function readCheckedPosition(page: Page): Promise<null | string> {
	return page
		.locator('#talk [aria-checked="true"]')
		.evaluate((position) => position.textContent.trim());
}

test('a trusted press holds the momentary position and a release springs it back', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const box = await page.getByRole('radio', { name: 'Duck' }).boundingBox();
	if (!box) throw new Error('Duck has no box');

	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	expect(await readCheckedPosition(page)).toBe('Duck');
	await expect(page.locator('#talk')).toHaveJSProperty('value', 'duck');

	await page.mouse.move(box.x + box.width / 2, box.y + box.height * 4, { steps: 3 });
	expect(await readCheckedPosition(page)).toBe('Duck');

	await page.mouse.up();
	expect(await readCheckedPosition(page)).toBe('Off');
});

test('the bat moves toward the checked position', async ({ page }) => {
	const ballOffset = (): Promise<string> =>
		page
			.locator('#talk .sonic-switch-bat')
			.evaluate((bat) => getComputedStyle(bat, '::after').translate);

	expect(await ballOffset()).toMatch(/^0px( 0px)?$/);

	await page.getByRole('radio', { name: 'On' }).click();
	await expect.poll(ballOffset).toMatch(/^0px [1-9]/);
});

test('a trusted press on a switch flips it once, and a drag sets it by direction', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const bare = page.getByRole('switch', { name: 'Sync' });
	const at = await centreOf(bare);

	await page.mouse.click(at.x, at.y);
	await expect(bare).toHaveAttribute('aria-checked', 'true');

	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.move(at.x, at.y + 20, { steps: 4 });
	await expect(bare).toHaveAttribute('aria-checked', 'false');
	await page.mouse.up();
	await expect(bare).toHaveAttribute('aria-checked', 'false');
});

test('a drag on the bat throws it through its positions', async ({ isMobile, page }) => {
	test.skip(isMobile, mouseOnly);

	const at = await centreOf(page.locator('#talk .sonic-switch-bat'));

	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.move(at.x, at.y + 14, { steps: 4 });
	expect(await readCheckedPosition(page)).toBe('On');
	await page.mouse.move(at.x, at.y - 40, { steps: 8 });
	expect(await readCheckedPosition(page)).toBe('Duck');
	await page.mouse.up();
	expect(await readCheckedPosition(page)).toBe('Off');
});

test('a press or a drag on the bat carries the focus the switch held to the new position', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const at = await centreOf(page.locator('#talk .sonic-switch-bat'));

	await page.getByRole('radio', { name: 'Off' }).focus();
	await page.mouse.click(at.x, at.y);
	await expect(page.getByRole('radio', { name: 'On' })).toBeChecked();
	await expect(page.getByRole('radio', { name: 'On' })).toBeFocused();

	const thrown = await centreOf(page.locator('#talk .sonic-switch-bat'));

	await page.mouse.move(thrown.x, thrown.y);
	await page.mouse.down();
	await page.mouse.move(thrown.x, thrown.y - 14, { steps: 4 });
	await page.mouse.up();
	await expect(page.getByRole('radio', { name: 'Off' })).toBeChecked();
	await expect(page.getByRole('radio', { name: 'Off' })).toBeFocused();
});
