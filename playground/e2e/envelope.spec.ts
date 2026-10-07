import { expect, test } from '@playwright/test';

import { drag, mouseOnly } from './pointer.ts';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
	await page.locator('#envelope .sonic-envelope').evaluate((envelope) => {
		envelope.scrollIntoView({ block: 'center' });
	});
});

test('an envelope ahead of its dials in the document still draws them', async ({ page }) => {
	await expect(page.locator('#envelope .sonic-envelope-line')).toHaveAttribute('d', /^M0 1L/);
	await expect(page.locator('#envelope .sonic-envelope-handle:not([hidden])')).toHaveCount(3);
});

test('a drag on the decay handle turns the decay and sustain dials', async ({ isMobile, page }) => {
	test.skip(isMobile, mouseOnly);

	const handle = page.locator('#envelope .sonic-envelope-handle[data-sonic-stage="decay"]');
	const [decay, sustain] = [
		page.getByRole('slider', { exact: true, name: 'Envelope decay' }),
		page.getByRole('slider', { name: 'Envelope sustain' }),
	];
	const box = await handle.boundingBox();
	if (!box) throw new Error('The handle has no box');

	await drag(page, handle, { x: 20, y: 12 });

	await expect
		.poll(async () => Number(await decay.getAttribute('aria-valuenow')))
		.toBeGreaterThan(45);
	await expect
		.poll(async () => Number(await sustain.getAttribute('aria-valuenow')))
		.toBeLessThan(0.6);

	const moved = await handle.boundingBox();

	expect(moved?.x).toBeGreaterThan(box.x);
	expect(moved?.y).toBeGreaterThan(box.y);
});

test('a curve handle bows its stage and turns only its curve dial', async ({ isMobile, page }) => {
	test.skip(isMobile, mouseOnly);

	const curveHandle = page.locator(
		'#envelope-curves .sonic-envelope-curve[data-sonic-stage="decay"]',
	);
	const curve = page.getByRole('slider', { name: 'Envelope decay curve' });
	const line = page.locator('#envelope-curves .sonic-envelope-line');
	const before = await line.getAttribute('d');

	await expect(page.locator('#envelope-curves .sonic-envelope-curve:not([hidden])')).toHaveCount(2);
	await drag(page, curveHandle, { x: 0, y: -12 });

	await expect
		.poll(async () => Number(await curve.getAttribute('aria-valuenow')))
		.toBeGreaterThan(3);
	await expect(page.getByRole('slider', { exact: true, name: 'Envelope decay' })).toHaveAttribute(
		'aria-valuenow',
		'45',
	);
	expect(await line.getAttribute('d')).not.toBe(before);
});
