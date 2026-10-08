import { expect, test } from '@playwright/test';

test.skip(
	({ browserName }) => browserName !== 'chromium',
	'The fake microphone is a Chromium flag',
);

// The headless shell has no media capture at all, so this file runs the full browser's headless mode
test.use({
	channel: 'chromium',
	launchOptions: { args: ['--use-fake-device-for-media-stream'] },
});

test.beforeEach(async ({ page }) => {
	await page.goto('/tape-echo/');
});

test('the microphone feeds the echo once Mic is chosen and Play is pressed', async ({
	context,
	page,
}) => {
	await context.grantPermissions(['microphone']);

	const inputLevel = () =>
		page
			.locator('sonic-meter[data-echo-meter="input"]')
			.evaluate((meter: HTMLElement & { level: number }) => meter.level);

	await page.getByRole('radio', { name: 'Mic' }).click();

	expect(await inputLevel()).toBe(0);

	await page.getByRole('button', { name: 'Play' }).click();

	await expect.poll(inputLevel).toBeGreaterThan(0);
	await expect(page.locator('[data-echo-mic-hint]')).toBeVisible();
});

test('a refused microphone returns the source to Phrase and says why', async ({ page }) => {
	await page.getByRole('radio', { name: 'Mic' }).click();
	await page.getByRole('button', { name: 'Play' }).click();

	await expect(page.getByRole('radio', { name: 'Phrase' })).toBeChecked();
	await expect(page.locator('[data-echo-source-status]')).toHaveText(
		'Microphone permission was refused',
	);
	await expect(page.locator('[data-echo-mic-hint]')).toBeHidden();
});
