import { expect, test } from '@playwright/test';

test('a busy button pulses its legend, and holds it steady under reduced motion', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const legend = page.locator('#loading .sonic-button-cap > svg');

	await expect(legend).toHaveCSS('animation-name', 'sonic-button-busy');
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect(legend).toHaveCSS('animation-name', 'none');
	await expect(legend).toHaveCSS('opacity', '1');
});
