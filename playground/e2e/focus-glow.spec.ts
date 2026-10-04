import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { centreOf, mouseOnly } from './pointer.ts';

const controls = [
	{ focused: '#phase .sonic-dial', lit: '#phase .sonic-dial', property: '--_sonic-focus-shadow' },
	{
		focused: '#xy .sonic-xy-axis[tabindex="0"]',
		lit: '#xy .sonic-xy-puck',
		property: '--_sonic-xy-puck-ring',
	},
];

for (const { focused, lit, property } of controls) {
	test(`a press focuses without the focus glow, and the next key lights it: ${focused}`, async ({
		isMobile,
		page,
	}) => {
		test.skip(isMobile, mouseOnly);

		await page.goto('/fixtures/');

		const readGlow = () =>
			page
				.locator(lit)
				.evaluate(
					(element, name) => getComputedStyle(element).getPropertyValue(name).trim(),
					property,
				);
		const rest = await readGlow();

		await page.locator(lit).scrollIntoViewIfNeeded();

		const at = await centreOf(page.locator(lit));

		await page.mouse.move(at.x, at.y);
		await page.mouse.down();
		await expect(page.locator(focused)).toBeFocused();
		expect(await readGlow()).toBe(rest);

		await page.mouse.move(at.x + 6, at.y - 6, { steps: 2 });
		await page.mouse.up();
		expect(await readGlow()).toBe(rest);

		await page.keyboard.press('ArrowUp');
		expect(await readGlow()).not.toBe(rest);
	});
}

async function pressDial(page: Page): Promise<{ readGlow: () => Promise<string>; rest: string }> {
	await page.goto('/fixtures/');

	const dial = page.locator('#phase .sonic-dial');
	const readGlow = () =>
		dial.evaluate((element) =>
			getComputedStyle(element).getPropertyValue('--_sonic-focus-shadow').trim(),
		);
	const rest = await readGlow();

	await dial.scrollIntoViewIfNeeded();

	const at = await centreOf(dial);

	await page.mouse.click(at.x, at.y);
	await expect(dial).toBeFocused();

	return { readGlow, rest };
}

test('a shortcut after a press leaves the focus glow off', async ({ isMobile, page }) => {
	test.skip(isMobile, mouseOnly);

	const { readGlow, rest } = await pressDial(page);

	await page.keyboard.press('ControlOrMeta+c');
	await page.keyboard.press('Alt+F6');

	expect(await readGlow()).toBe(rest);
});
