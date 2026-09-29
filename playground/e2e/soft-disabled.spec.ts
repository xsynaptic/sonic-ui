import { expect, test } from '@playwright/test';

test('a focused key keeps focus when it turns soft-disabled, and its presses reach nothing', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const host = page.locator('#next');
	const key = page.getByRole('button', { name: 'Next' });

	await host.evaluate((element) => {
		element.addEventListener('click', () => {
			element.dataset.clicked = '';
		});
	});
	await key.focus();
	await host.evaluate((element) => {
		element.setAttribute('soft-disabled', '');
	});
	await expect(key).toBeFocused();
	await expect(key).toHaveAttribute('aria-disabled', 'true');

	// Playwright waits for an `aria-disabled` button to enable, so `force` clicks it as it stands
	await page.keyboard.press('Enter');
	await key.click({ force: true });
	await expect(host).not.toHaveAttribute('data-clicked');
});
