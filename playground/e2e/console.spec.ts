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

test('the tape echo loads with a clean console', async ({ page }) => {
	const messages = collectConsole(page);

	await page.goto('/tape-echo/');
	await expect(page.getByRole('slider', { name: 'Mode' })).toBeVisible();

	expect(messages).toEqual([]);
});

test('the tape echo plays through every mode with a clean console', async ({ page }) => {
	const messages = collectConsole(page);

	await page.goto('/tape-echo/');
	await page.getByRole('button', { name: 'Play' }).click();

	const mode = page.getByRole('slider', { name: 'Mode' });

	for (const name of ['Dual', 'Ping-pong', 'Rhythm']) {
		await mode.press('ArrowUp');
		await expect(mode).toHaveAttribute('aria-valuetext', name);
	}
	await page.getByRole('radio', { name: 'Time' }).first().click();
	await page.getByRole('button', { name: 'Play' }).click();

	expect(messages).toEqual([]);
});

test('the web player plays with a clean console', async ({ page }) => {
	const messages = collectConsole(page);

	await page.goto('/web-player/');
	await page.getByRole('button', { name: 'Play' }).click();
	await expect(page.getByRole('slider', { name: 'Seek' })).toBeEnabled();

	expect(messages).toEqual([]);
});

test('a control without the material warns', async ({ page }) => {
	const messages = collectConsole(page);

	await page.goto('/fixtures/bare/');

	await expect.poll(() => messages).toEqual([expect.stringContaining('material.css')]);
});
