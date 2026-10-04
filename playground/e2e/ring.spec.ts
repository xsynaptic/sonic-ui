import { expect, test } from '@playwright/test';

test('a ring sizes and rounds the button it holds, centred inside the arc', async ({ page }) => {
	await page.goto('/fixtures/');

	const ring = page.locator('#ring-button');
	const button = ring.locator('.sonic-button');
	const [outer, inner] = [await ring.boundingBox(), await button.boundingBox()];
	if (!outer || !inner) throw new Error('The ring has no box');

	expect(outer.width).toBeCloseTo(40, 1);
	expect(outer.height).toBeCloseTo(40, 1);
	expect(inner.width).toBeCloseTo(30, 1);
	expect(inner.height).toBeCloseTo(30, 1);
	expect(inner.x - outer.x).toBeCloseTo(5, 1);
	expect(inner.y - outer.y).toBeCloseTo(5, 1);
	await expect(button).toHaveCSS('border-radius', '15px');
	await expect(button.locator('.sonic-button-cap')).toHaveCSS('border-radius', '15px');
});

test('a button inside a ring still takes its presses', async ({ page }) => {
	await page.goto('/fixtures/');

	const button = page.getByRole('button', { name: 'Loop position' });

	await button.click();
	await expect(button).toHaveAttribute('aria-pressed', 'true');
});
