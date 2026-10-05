import { expect, test } from '@playwright/test';

import { centerOf, mouseOnly } from './pointer.ts';

const controls = [
	{ focused: '#phase .sonic-dial', lit: '#phase .sonic-dial', property: '--_sonic-focus-shadow' },
	{
		focused: '#xy .sonic-xy-axis[tabindex="0"]',
		lit: '#xy .sonic-xy-puck',
		property: '--_sonic-xy-puck-ring',
	},
];

for (const { focused, lit, property } of controls) {
	test(`a press focuses without the focus glow, a shortcut leaves it off, and the next key lights it: ${focused}`, async ({
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

		const at = await centerOf(page.locator(lit));

		await page.mouse.move(at.x, at.y);
		await page.mouse.down();
		await expect(page.locator(focused)).toBeFocused();
		expect(await readGlow()).toBe(rest);

		await page.mouse.move(at.x + 6, at.y - 6, { steps: 2 });
		await page.mouse.up();
		expect(await readGlow()).toBe(rest);

		await page.keyboard.press('ControlOrMeta+c');
		await page.keyboard.press('Alt+F6');
		expect(await readGlow()).toBe(rest);

		await page.keyboard.press('ArrowUp');
		expect(await readGlow()).not.toBe(rest);
	});
}
