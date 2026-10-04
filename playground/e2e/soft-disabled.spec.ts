import { expect, test } from '@playwright/test';

test('a focused button keeps focus when it turns soft-disabled, and its presses reach nothing', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const host = page.locator('#next');
	const button = page.getByRole('button', { name: 'Next' });

	await host.evaluate((element) => {
		element.addEventListener('click', () => {
			element.dataset.clicked = '';
		});
	});
	await button.focus();
	await host.evaluate((element) => {
		element.setAttribute('soft-disabled', '');
	});
	await expect(button).toBeFocused();
	await expect(button).toHaveAttribute('aria-disabled', 'true');

	// Playwright waits for an `aria-disabled` button to enable, so `force` clicks it as it stands
	await page.keyboard.press('Enter');
	await button.click({ force: true });
	await expect(host).not.toHaveAttribute('data-clicked');
});
