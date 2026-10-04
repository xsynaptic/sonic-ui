import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

test('the readout opens above a dial in a filtered bar with room below it', async ({ page }) => {
	await page.goto('/fixtures/docked/');
	await page.evaluate(() => {
		window.scrollTo(0, document.body.scrollHeight);
	});

	const host = page.locator('#docked');

	await host.getByRole('slider').focus();
	await page.keyboard.press('ArrowUp');
	await expect(host.locator('.sonic-dial-readout')).toBeVisible();

	const gap = await host.evaluate((element) => {
		const dial = element.querySelector('.sonic-dial')?.getBoundingClientRect();
		const readout = element.querySelector('.sonic-dial-readout')?.getBoundingClientRect();
		if (!dial || !readout) throw new Error('The dial did not render');

		return dial.top - readout.bottom;
	});

	expect(gap).toBeGreaterThanOrEqual(0);
});

test('a readout size in em follows the control, not the readout', async ({ page }) => {
	await page.goto('/fixtures/');

	const host = page.locator('#level');

	await host.evaluate((element) => {
		element.style.setProperty('font-size', '20px');
		element.style.setProperty('--sonic-readout-size', '3em');
	});

	const readout = host.locator('.sonic-dial-readout');

	await expect(readout).toHaveCSS('block-size', '60px');
	await expect(readout).toHaveCSS('font-size', '30px');
});

test('a closed readout is not rendered', async ({ page }) => {
	await page.goto('/fixtures/docked/');

	await expect(page.locator('#docked .sonic-dial-readout')).toHaveCSS('display', 'none');
});
