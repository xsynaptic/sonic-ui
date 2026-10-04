import type { Locator } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { centreOf, drag, mouseOnly } from './pointer.ts';
import { readState } from './state.ts';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
});

function readLens(led: Locator): Promise<string> {
	return led.evaluate((element) => {
		const style = getComputedStyle(element, '::after');

		return `${style.backgroundImage} ${style.backgroundColor}`;
	});
}

test('a latched button lights the LED it holds, as data-sonic-lit does', async ({ page }) => {
	const [unlit, lit] = [
		await readLens(page.locator('#led')),
		await readLens(page.locator('#led-lit')),
	];
	const held = page.locator('#power .sonic-button .sonic-led');

	expect(lit).not.toBe(unlit);
	expect(await readLens(held)).toBe(unlit);

	await page.locator('#power .sonic-button').click();
	expect(await readLens(held)).toBe(lit);
});

test('a second-colour LED lights in its own colour', async ({ page }) => {
	expect(await readLens(page.locator('#led-alt'))).not.toBe(
		await readLens(page.locator('#led-lit')),
	);
});

test('hot, clip and dim lenses each differ from lit and from off', async ({ page }) => {
	const lenses = await Promise.all(
		['#led', '#led-lit', '#led-hot', '#led-clip', '#led-dim'].map((selector) =>
			readLens(page.locator(selector)),
		),
	);

	expect(new Set(lenses).size).toBe(lenses.length);
});

test('an LED inside an armed button rests dim, then lights once latched', async ({ page }) => {
	const held = page.locator('#armed-led .sonic-button .sonic-led');

	expect(await readLens(held)).toBe(await readLens(page.locator('#led-dim')));

	await page.locator('#armed-led .sonic-button').click();
	expect(await readLens(held)).toBe(await readLens(page.locator('#led-lit')));
});

test('a slider is at its origin, and its child LED lights only there', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const host = page.locator('#rest');
	const led = host.locator(':scope > .sonic-led');
	const [unlit, lit] = [
		await readLens(page.locator('#led')),
		await readLens(page.locator('#led-lit')),
	];

	await host.locator('.sonic-slider').scrollIntoViewIfNeeded();
	expect(await readState(host, 'at-origin')).toBe(true);
	expect(await readLens(led)).toBe(lit);

	await drag(page, host.locator('.sonic-slider-cap'), { x: 20, y: 0 });
	expect(await readState(host, 'at-origin')).toBe(false);
	expect(await readLens(led)).toBe(unlit);

	await page.keyboard.press('Delete');
	expect(await readState(host, 'at-origin')).toBe(true);
	expect(await readLens(led)).toBe(lit);

	await host.evaluate((element) => {
		element.setAttribute('disabled', '');
	});
	expect(await readState(host, 'at-origin')).toBe(true);
	expect(await readLens(led)).toBe(unlit);
});

test('with no origin a slider rests only at its minimum', async ({ page }) => {
	const host = page.locator('#rest');

	await host.evaluate((element) => {
		element.removeAttribute('origin');
	});
	expect(await readState(host, 'at-origin')).toBe(false);

	await host.locator('.sonic-slider').press('Home');
	expect(await readState(host, 'at-origin')).toBe(true);
});

test('a springing slider is at rest again once let go', async ({ isMobile, page }) => {
	test.skip(isMobile, mouseOnly);

	const host = page.locator('#bend');
	const start = await centreOf(host.locator('.sonic-slider-cap'));

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + 20, start.y, { steps: 4 });
	expect(await readState(host, 'at-origin')).toBe(false);

	await page.mouse.up();
	expect(await readState(host, 'at-origin')).toBe(true);
});
