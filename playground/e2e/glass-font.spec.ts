import type { Locator } from '@playwright/test';

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
});

function readFont(target: Locator): Promise<string> {
	return target.evaluate((element) => getComputedStyle(element).fontFamily);
}

test('--sonic-glass-font reaches the readout and its entry; unset, the readout inherits', async ({
	page,
}) => {
	const host = page.locator('#level');
	const readout = host.locator('.sonic-dial-readout');

	await host.evaluate((element) => {
		element.style.fontFamily = 'serif';
	});
	expect(await readFont(readout)).toBe('serif');

	await host.evaluate((element) => {
		element.style.setProperty('--sonic-glass-font', 'monospace');
	});
	expect(await readFont(readout)).toBe('monospace');
	expect(await readFont(host.locator('.sonic-dial-entry'))).toBe('monospace');
});
