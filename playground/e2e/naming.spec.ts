import { expect, test } from '@playwright/test';

// axe exempts custom-element hosts from `aria-prohibited-attr` and never checks that a name reaches the inner control; this spec does
test('each control takes its name from the host', async ({ page }) => {
	await page.goto('/fixtures/');

	await expect(page.getByRole('slider', { name: 'Level' })).toBeVisible();
	await expect(page.getByRole('slider', { name: 'Send' })).toBeVisible();
	await expect(page.getByRole('spinbutton', { name: 'Tempo' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Mute' })).toBeVisible();
	await expect(page.getByRole('radiogroup', { name: 'Mode' })).toBeVisible();
	await expect(page.getByRole('radio', { checked: true, name: 'LP' })).toBeVisible();
});
