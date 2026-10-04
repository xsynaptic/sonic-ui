import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { centreOf, mouseOnly } from './pointer.ts';
import { readState } from './state.ts';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
	await page.evaluate(() => {
		document.body.dataset.kick = '';
		document.body.addEventListener('change', (event) => {
			if (!(event.target instanceof HTMLElement) || event.target.id !== 'kick') return;

			const { dataset } = document.body;

			dataset.kick = `${dataset.kick ?? ''}${event.target.matches(':state(pressed)') ? 'down' : 'up'} `;
		});
	});
});

function readChanges(page: Page): Promise<string | undefined> {
	return page.evaluate(() => document.body.dataset.kick);
}

test('a momentary button stays pressed until the pointer lifts, even off the button', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const kick = page.locator('#kick');
	const at = await centreOf(kick.locator('.sonic-button'));

	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	expect(await readState(kick, 'pressed')).toBe(true);

	await page.mouse.move(at.x + 80, at.y - 80, { steps: 4 });
	expect(await readState(kick, 'pressed')).toBe(true);

	await page.mouse.up();
	expect(await readState(kick, 'pressed')).toBe(false);
	expect(await readChanges(page)).toBe('down up ');
});

test('Space holds a momentary button until the key lifts, and focus leaving mid-hold lets it go', async ({
	page,
}) => {
	const kick = page.locator('#kick');

	await kick.locator('.sonic-button').focus();
	await page.keyboard.down('Space');
	expect(await readState(kick, 'pressed')).toBe(true);

	await page.keyboard.up('Space');
	expect(await readState(kick, 'pressed')).toBe(false);

	await page.keyboard.down('Space');
	await page.keyboard.press('Tab');
	expect(await readState(kick, 'pressed')).toBe(false);

	await page.keyboard.up('Space');
	expect(await readChanges(page)).toBe('down up down up ');
});
