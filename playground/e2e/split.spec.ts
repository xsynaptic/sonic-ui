import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import type { Point } from './pointer.ts';

import { centerOf, mouseOnly } from './pointer.ts';

async function valueOf(page: Page, name: string): Promise<number> {
	const slider = page.getByRole('slider', { exact: true, name });

	return Number(await slider.getAttribute('aria-valuenow'));
}

async function capBox(page: Page, id: string): Promise<{ cap: Point; grooveRight: number }> {
	const cap = await centerOf(page.locator(`#${id} .sonic-slider-cap`));
	const groove = await page.locator(`#${id} .sonic-slider`).boundingBox();
	if (!groove) throw new Error(`#${id} has no box`);

	return { cap, grooveRight: groove.x + groove.width };
}

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
	await page.locator('#split-locked').scrollIntoViewIfNeeded();
});

test('a drag past what the siblings can give stops the cap at its limit, and the free sibling gives way', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const first = await capBox(page, 'locked-a');
	const third = await capBox(page, 'locked-c');

	await page.mouse.move(first.cap.x, first.cap.y);
	await page.mouse.down();
	await page.mouse.move(first.grooveRight + 80, first.cap.y, { steps: 6 });
	await page.mouse.up();

	await expect.poll(() => valueOf(page, 'Locked A')).toBe(70);
	expect(await valueOf(page, 'Locked B')).toBe(30);
	expect(await valueOf(page, 'Locked C')).toBe(0);

	const firstAfter = await capBox(page, 'locked-a');
	const thirdAfter = await capBox(page, 'locked-c');

	expect(firstAfter.cap.x).toBeLessThan(first.grooveRight - 20);
	expect(thirdAfter.cap.x).toBeLessThan(third.cap.x);
});

test.describe('two fingers', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'Two touch points need CDP');
	test.use({ hasTouch: true });

	test('two members held together keep their values and the third takes the difference', async ({
		page,
	}) => {
		const session = await page.context().newCDPSession(page);
		const first = await centerOf(page.locator('#split-a .sonic-slider-cap'));
		const third = await centerOf(page.locator('#split-c .sonic-slider-cap'));
		const at = (by: number): Array<Point & { id: number }> => [
			{ id: 0, x: first.x + by, y: first.y },
			{ id: 1, x: third.x + by, y: third.y },
		];

		await session.send('Input.dispatchTouchEvent', { touchPoints: at(0), type: 'touchStart' });
		for (let move = 1; move <= 8; move += 1) {
			await session.send('Input.dispatchTouchEvent', {
				touchPoints: at(move * 3),
				type: 'touchMove',
			});
		}
		await session.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' });

		await expect.poll(() => valueOf(page, 'Split A')).toBeGreaterThan(50);

		const values = await Promise.all(
			['Split A', 'Split B', 'Split C'].map((name) => valueOf(page, name)),
		);
		const [, middle = NaN, last = NaN] = values;

		expect(last).toBeGreaterThan(20);
		expect(middle).toBeLessThan(30);
		expect(values.reduce((total, value) => total + value, 0)).toBe(100);
	});
});
