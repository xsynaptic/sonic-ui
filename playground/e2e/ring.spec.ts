import { expect, test } from '@playwright/test';

test('a ring sizes and rounds the key it holds, centred inside the arc', async ({ page }) => {
	await page.goto('/fixtures/');

	const ring = page.locator('#ring-key');
	const key = ring.locator('.sonic-key');
	const [outer, inner] = [await ring.boundingBox(), await key.boundingBox()];
	if (!outer || !inner) throw new Error('The ring has no box');

	expect(outer.width).toBeCloseTo(40, 1);
	expect(outer.height).toBeCloseTo(40, 1);
	expect(inner.width).toBeCloseTo(30, 1);
	expect(inner.height).toBeCloseTo(30, 1);
	expect(inner.x - outer.x).toBeCloseTo(5, 1);
	expect(inner.y - outer.y).toBeCloseTo(5, 1);
	await expect(key).toHaveCSS('border-radius', '15px');
	await expect(key.locator('.sonic-key-cap')).toHaveCSS('border-radius', '15px');
});

test('a key inside a ring still takes its presses', async ({ page }) => {
	await page.goto('/fixtures/');

	const key = page.getByRole('button', { name: 'Loop position' });

	await key.click();
	await expect(key).toHaveAttribute('aria-pressed', 'true');
});
