import { expect, test } from '@playwright/test';

import { boxOf, drag, mouseOnly } from './pointer.ts';
import { valueNow } from './state.ts';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
	await page.locator('#envelope .sonic-envelope').evaluate((envelope) => {
		envelope.scrollIntoView({ block: 'center' });
	});
});

test('an envelope ahead of its dials draws them, a stage handle turns its dials and a curve handle its curve', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	await test.step('an envelope ahead of its dials in the document still draws them', async () => {
		await expect(page.locator('#envelope .sonic-envelope-line')).toHaveAttribute('d', /^M0 1L/);
		await expect(page.locator('#envelope .sonic-envelope-handle:not([hidden])')).toHaveCount(3);
	});

	await test.step('a drag on the decay handle turns the decay and sustain dials', async () => {
		const handle = page.locator('#envelope .sonic-envelope-handle[data-sonic-stage="decay"]');
		const [decay, sustain] = [
			page.getByRole('slider', { exact: true, name: 'Envelope decay' }),
			page.getByRole('slider', { name: 'Envelope sustain' }),
		];
		const box = await boxOf(handle);

		await drag(page, handle, { x: 20, y: 12 });

		await expect.poll(() => valueNow(decay)).toBeGreaterThan(45);
		await expect.poll(() => valueNow(sustain)).toBeLessThan(0.6);

		const moved = await handle.boundingBox();

		expect(moved?.x).toBeGreaterThan(box.x);
		expect(moved?.y).toBeGreaterThan(box.y);
	});

	await test.step('a curve handle bows its stage and turns only its curve dial', async () => {
		const curveHandle = page.locator(
			'#envelope-curves .sonic-envelope-curve[data-sonic-stage="decay"]',
		);
		const curve = page.getByRole('slider', { name: 'Envelope decay curve' });
		const line = page.locator('#envelope-curves .sonic-envelope-line');
		const decay = page.getByRole('slider', { exact: true, name: 'Envelope decay' });
		const [before, decayBefore] = [
			await line.getAttribute('d'),
			await decay.getAttribute('aria-valuenow'),
		];

		await expect(page.locator('#envelope-curves .sonic-envelope-curve:not([hidden])')).toHaveCount(
			2,
		);
		await drag(page, curveHandle, { x: 0, y: -12 });

		await expect.poll(() => valueNow(curve)).toBeGreaterThan(3);
		await expect(decay).toHaveAttribute('aria-valuenow', decayBefore ?? '');
		expect(await line.getAttribute('d')).not.toBe(before);
	});
});
