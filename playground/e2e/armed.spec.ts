import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

function readInk(page: Page, id: string): Promise<string> {
	return page.locator(`#${id} .sonic-key`).evaluate((key) => getComputedStyle(key).color);
}

test('an armed key inks apart from a plain key and a latched one, and latches to the latched ink', async ({
	page,
}) => {
	await page.goto('/fixtures/');
	// The ink fades over 120ms
	await page.addStyleTag({ content: '.sonic-key { transition: none !important; }' });

	const [plain, armed] = [await readInk(page, 'next'), await readInk(page, 'armed')];

	await page.locator('#mute .sonic-key').click();

	const latched = await readInk(page, 'mute');

	expect(latched).not.toBe(plain);
	expect(armed).not.toBe(plain);
	expect(armed).not.toBe(latched);

	await page.locator('#armed .sonic-key').click();
	expect(await readInk(page, 'armed')).toBe(latched);
});
