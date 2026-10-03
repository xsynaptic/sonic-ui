import { expect, test } from '@playwright/test';

import { centreOf, mouseOnly } from './pointer.ts';

const controls = [
	{ focused: '#phase .sonic-dial', lit: '#phase .sonic-dial' },
	{ focused: '#send .sonic-slider', lit: '#send .sonic-slider' },
	{ focused: '#xy .sonic-xy-axis[tabindex="0"]', lit: '#xy .sonic-xy-puck' },
];

for (const { focused, lit } of controls) {
	test(`a press focuses without the focus glow, and the next key lights it: ${focused}`, async ({
		isMobile,
		page,
	}) => {
		test.skip(isMobile, mouseOnly);

		await page.goto('/fixtures/');

		const readGlow = () =>
			page
				.locator(lit)
				.evaluate((element) =>
					getComputedStyle(element).getPropertyValue('--_sonic-focus-shadow').trim(),
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
