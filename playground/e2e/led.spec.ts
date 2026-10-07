import type { Locator } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { drag, mouseOnly } from './pointer.ts';
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

test(
	'each lens differs from the rest, and a button lights the LED it holds: idle while armed, lit once latched',
	{ tag: '@mobile' },
	async ({ page }) => {
		const lenses = await Promise.all(
			['#led', '#led-lit', '#led-warning', '#led-danger', '#led-idle', '#led-ok'].map((selector) =>
				readLens(page.locator(selector)),
			),
		);
		const [unlit, lit] = lenses;
		const idle = lenses[4];

		expect(new Set(lenses).size).toBe(lenses.length);

		const held = page.locator('#power .sonic-button .sonic-led');

		expect(await readLens(held)).toBe(unlit);

		await page.locator('#power .sonic-button').click();
		expect(await readLens(held)).toBe(lit);

		const armed = page.locator('#armed-led .sonic-button .sonic-led');

		expect(await readLens(armed)).toBe(idle);

		await page.locator('#armed-led .sonic-button').click();
		expect(await readLens(armed)).toBe(lit);
	},
);

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

test('an LED in a disabled latched button dims and does not go out', async ({ page }) => {
	const host = page.locator('#power');
	const held = host.locator('.sonic-button .sonic-led');
	const unlit = await readLens(held);

	await host.locator('.sonic-button').click();

	const lit = await readLens(held);

	await host.evaluate((element) => {
		element.setAttribute('disabled', '');
	});

	const dimmed = await readLens(held);

	expect(dimmed).not.toBe(lit);
	expect(dimmed).not.toBe(unlit);
});
