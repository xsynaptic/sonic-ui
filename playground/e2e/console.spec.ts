import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

function collectConsole(page: Page): Array<string> {
	const messages: Array<string> = [];

	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') messages.push(message.text());
	});
	page.on('pageerror', (error) => {
		messages.push(error.message);
	});

	return messages;
}

test('the fixtures load with a clean console', async ({ page }) => {
	const messages = collectConsole(page);

	await page.goto('/fixtures/');
	await expect(page.getByRole('slider', { name: 'Level' })).toBeVisible();

	expect(messages).toEqual([]);
});

test('the club mixer loads with a clean console', async ({ page }) => {
	const messages = collectConsole(page);

	await page.goto('/club-mixer/');
	await expect(page.getByRole('slider', { name: 'Crossfader' })).toBeVisible();

	expect(messages).toEqual([]);
});

test('a control without the material warns', async ({ page }) => {
	const messages = collectConsole(page);

	await page.goto('/fixtures/bare/');

	await expect.poll(() => messages).toEqual([expect.stringContaining('material.css')]);
});
