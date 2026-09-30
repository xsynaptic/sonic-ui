import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

// The readout's rise on opening would shift its box mid-measure
test.use({ reducedMotion: 'reduce' });

async function readoutOffset(page: Page, id: string): Promise<{ above: number; across: number }> {
	return page.locator(`#${id}`).evaluate((element) => {
		const slider = element.querySelector('.sonic-slider')?.getBoundingClientRect();
		const cap = element.querySelector('.sonic-slider-cap')?.getBoundingClientRect();
		const readout = element.querySelector('.sonic-slider-readout')?.getBoundingClientRect();
		if (!slider || !cap || !readout) throw new Error('The slider did not render');

		return {
			above: slider.top - readout.bottom,
			across: readout.left + readout.width / 2 - (cap.left + cap.width / 2),
		};
	});
}

test('a length of 100% fills the parent, and the cap travels to its far end', async ({ page }) => {
	await page.goto('/fixtures/');

	const strip = page.locator('#strip');

	await strip.getByRole('slider').focus();
	await page.keyboard.press('End');

	const gaps = await strip.evaluate((element) => {
		const parent = element.parentElement?.getBoundingClientRect();
		const slider = element.querySelector('.sonic-slider')?.getBoundingClientRect();
		const cap = element.querySelector('.sonic-slider-cap')?.getBoundingClientRect();
		if (!parent || !slider || !cap) throw new Error('The slider did not render');

		return { end: slider.right - cap.right, width: parent.width - slider.width };
	});

	expect(Math.abs(gaps.width)).toBeLessThan(0.5);
	expect(Math.abs(gaps.end)).toBeLessThan(0.5);
});

test('a focused capless slider shows its focus on the groove', async ({ page }) => {
	await page.goto('/fixtures/');

	const control = page.locator('#strip').getByRole('slider');
	const groove = page.locator('#strip .sonic-slider-groove');
	const resting = await groove.evaluate((element) => getComputedStyle(element).boxShadow);

	await control.focus();
	await page.keyboard.press('ArrowRight');

	await expect(groove).not.toHaveCSS('box-shadow', resting);
});

test('the readout follows the cap along a long horizontal slider', async ({ page }) => {
	await page.goto('/fixtures/');

	const control = page.locator('#strip').getByRole('slider');
	const readout = page.locator('#strip .sonic-slider-readout');

	await control.focus();
	await page.keyboard.press('PageUp');
	await expect(readout).toBeVisible();

	const low = await readoutOffset(page, 'strip');

	expect(Math.abs(low.across)).toBeLessThan(1);

	await page.keyboard.press('End');
	await page.keyboard.press('PageDown');
	await expect(control).toHaveAttribute('aria-valuenow', '250');

	const high = await readoutOffset(page, 'strip');

	expect(Math.abs(high.across)).toBeLessThan(1);
});

test('a vertical fader keeps its readout centred above its top end', async ({ page }) => {
	await page.goto('/fixtures/');

	const fader = page.locator('#fader');

	await fader.evaluate((element) => {
		element.toggleAttribute('readout', true);
	});
	await fader.getByRole('slider').focus();
	await page.keyboard.press('ArrowUp');
	await expect(fader.locator('.sonic-slider-readout')).toBeVisible();

	const offset = await readoutOffset(page, 'fader');

	expect(offset.above).toBeGreaterThanOrEqual(0);
	expect(Math.abs(offset.across)).toBeLessThan(1);
});
