import { expect, test } from '@playwright/test';

// The readout's rise on opening would shift its box mid-measure
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

test('a closed readout is not rendered', async ({ page }) => {
	await page.goto('/fixtures/docked/');

	await expect(page.locator('#docked .sonic-dial-readout')).toHaveCSS('display', 'none');
});
