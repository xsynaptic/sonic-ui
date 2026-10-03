import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import type { Point } from './pointer.ts';

import { centreOf } from './pointer.ts';

test.skip(({ browserName }) => browserName !== 'chromium', 'A touch swipe needs CDP');
test.use({ hasTouch: true, viewport: { height: 400, width: 400 } });

async function swipe(page: Page, from: Point, to: Point): Promise<void> {
	const session = await page.context().newCDPSession(page);
	const moves = 10;

	await session.send('Input.dispatchTouchEvent', { touchPoints: [from], type: 'touchStart' });
	for (let move = 1; move <= moves; move += 1) {
		const x = from.x + ((to.x - from.x) * move) / moves;
		const y = from.y + ((to.y - from.y) * move) / moves;

		await session.send('Input.dispatchTouchEvent', { touchPoints: [{ x, y }], type: 'touchMove' });
	}
	await session.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' });
}

async function centreInView(page: Page, selector: string): Promise<Point> {
	const target = page.locator(selector);

	await target.scrollIntoViewIfNeeded();

	return centreOf(target);
}

test('a mostly vertical swipe from a horizontal slider scrolls the page and leaves the value', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const from = await centreInView(page, '#send .sonic-slider');
	const scrolled = await page.evaluate(() => window.scrollY);

	await swipe(page, from, { x: from.x + 30, y: from.y - 150 });

	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrolled);
	await expect(page.getByRole('slider', { name: 'Send' })).toHaveAttribute('aria-valuenow', '0');
});

test('a horizontal swipe on a horizontal slider moves the value and not the page', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const from = await centreInView(page, '#send .sonic-slider');
	const scrolled = await page.evaluate(() => window.scrollY);

	await swipe(page, from, { x: from.x + 60, y: from.y });

	const slider = page.getByRole('slider', { name: 'Send' });

	await expect
		.poll(async () => Number(await slider.getAttribute('aria-valuenow')))
		.toBeGreaterThan(0);
	expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
});

test('a swipe on a pad moves both values and never the page', async ({ page }) => {
	await page.goto('/fixtures/');

	const from = await centreInView(page, '#xy .sonic-xy-puck');
	const scrolled = await page.evaluate(() => window.scrollY);

	await swipe(page, from, { x: from.x + 30, y: from.y - 30 });

	const pad = page.getByRole('slider', { exact: true, name: 'Pad' });

	await expect
		.poll(async () => Number(await pad.getAttribute('aria-valuenow')))
		.toBeGreaterThan(50);
	await expect(pad).toHaveAttribute('aria-valuetext', /^X \d+, Y (5[1-9]|[6-9]\d)$/);
	expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
});
