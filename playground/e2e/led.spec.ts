import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

function lensOf(page: Page, selector: string): Promise<string> {
	return page.locator(selector).evaluate((led) => getComputedStyle(led, '::after').backgroundImage);
}

test('a latched key lights the LED it holds, as data-sonic-lit does', async ({ page }) => {
	await page.goto('/fixtures/');

	const [unlit, lit] = [await lensOf(page, '#led'), await lensOf(page, '#led-lit')];
	const held = '#power .sonic-key .sonic-led';

	expect(lit).not.toBe(unlit);
	expect(await lensOf(page, held)).toBe(unlit);

	await page.locator('#power .sonic-key').click();
	expect(await lensOf(page, held)).toBe(lit);
});
