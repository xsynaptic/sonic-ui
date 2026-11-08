import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { centerOf, mouseOnly } from './pointer.ts';
import { valueNow } from './state.ts';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
});

function countEvents(host: Locator): Promise<void> {
	return host.evaluate((element) => {
		element.dataset.inputs = '0';
		element.dataset.changes = '0';
		document.body.addEventListener('input', (event) => {
			if (event.target === element)
				element.dataset.inputs = String(Number(element.dataset.inputs) + 1);
		});
		document.body.addEventListener('change', (event) => {
			if (event.target === element)
				element.dataset.changes = String(Number(element.dataset.changes) + 1);
		});
	});
}

function readCounts(host: Locator): Promise<{ changes: number; inputs: number }> {
	return host.evaluate((element) => ({
		changes: Number(element.dataset.changes),
		inputs: Number(element.dataset.inputs),
	}));
}

function readScroll(page: Page): Promise<number> {
	return page.evaluate(() => window.scrollY);
}

test('a held arrow steps on the press and repeats, with one change on a release off the arrow', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const host = page.locator('#tempo');
	const spinbutton = page.getByRole('spinbutton', { name: 'Tempo' });
	const at = await centerOf(host.locator('.sonic-number-increment'));

	await countEvents(host);
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await expect(spinbutton).toHaveAttribute('aria-valuenow', '120.5');
	await expect(spinbutton).toBeFocused();

	await expect.poll(() => valueNow(spinbutton)).toBeGreaterThanOrEqual(121.5);
	await page.mouse.move(at.x, at.y + 200);
	await page.mouse.up();

	const released = await valueNow(spinbutton);

	// Without capture a release off the arrow never reaches it, and the repeat runs on
	await page.waitForTimeout(400);
	expect(await valueNow(spinbutton)).toBe(released);

	const counts = await readCounts(host);

	expect(counts.inputs).toBeGreaterThanOrEqual(3);
	expect(counts.changes).toBe(1);
	await expect(host.locator('.sonic-number-increment')).not.toHaveAttribute('data-sonic-pressed');
});

test(
	'a tap on an arrow steps once without scrolling',
	{ tag: '@mobile' },
	async ({ hasTouch, page }) => {
		test.skip(!hasTouch, 'Needs a touchscreen');

		const host = page.locator('#tempo');
		const decrement = host.locator('.sonic-number-decrement');

		await decrement.scrollIntoViewIfNeeded();

		const at = await centerOf(decrement);
		const scrolled = await readScroll(page);

		await page.touchscreen.tap(at.x, at.y);

		await expect(page.getByRole('spinbutton', { name: 'Tempo' })).toHaveAttribute(
			'aria-valuenow',
			'119.5',
		);
		expect(await readScroll(page)).toBe(scrolled);
	},
);

test.describe('touch held', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'A touch hold needs CDP');
	test.use({ hasTouch: true });

	test(
		'a touch held on an arrow repeats and leaves the page where it was',
		{ tag: '@mobile' },
		async ({ page }) => {
			const host = page.locator('#tempo');
			const increment = host.locator('.sonic-number-increment');
			const spinbutton = page.getByRole('spinbutton', { name: 'Tempo' });

			await increment.scrollIntoViewIfNeeded();

			const at = await centerOf(increment);
			const scrolled = await readScroll(page);
			const session = await page.context().newCDPSession(page);

			await countEvents(host);
			await session.send('Input.dispatchTouchEvent', { touchPoints: [at], type: 'touchStart' });
			await expect.poll(() => valueNow(spinbutton)).toBeGreaterThanOrEqual(121.5);
			await session.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' });

			const { changes } = await readCounts(host);

			expect(changes).toBe(1);
			expect(await readScroll(page)).toBe(scrolled);
		},
	);
});
