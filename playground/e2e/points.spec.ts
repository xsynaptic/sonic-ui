import { expect, test } from '@playwright/test';

import { mouseOnly } from './pointer.ts';

const points = [
	'#envelope .sonic-envelope-handle[data-sonic-stage="decay"]',
	'#envelope-curves .sonic-envelope-dot[data-sonic-stage="decay"]',
];

for (const selector of points) {
	test(`a point on glass lights its ring on hover and fills while held: ${selector}`, async ({
		isMobile,
		page,
	}) => {
		test.skip(isMobile, mouseOnly);

		await page.goto('/fixtures/');
		await page.addStyleTag({ content: '* { transition: none !important; }' });

		const point = page.locator(selector);
		const read = () =>
			point.evaluate((element) => {
				const style = getComputedStyle(element);

				return { core: style.backgroundColor, ring: style.borderTopColor };
			});
		const rest = await read();

		await point.hover();

		const hovered = await read();

		await page.mouse.down();

		const held = await read();

		await page.mouse.up();
		expect(hovered.ring).not.toBe(rest.ring);
		expect(held).toEqual({ core: hovered.ring, ring: hovered.ring });
	});
}

test('the puck is a lit star that lifts on hover and glows while held', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	await page.goto('/fixtures/');
	await page.addStyleTag({ content: '*, *::before { transition: none !important; }' });

	const puck = page.locator('#xy .sonic-xy-puck');
	const read = () =>
		puck.evaluate((element) => ({
			glow: getComputedStyle(element).filter,
			star: getComputedStyle(element, '::before').backgroundColor,
		}));
	const rest = await read();

	await puck.hover();

	const hovered = await read();

	await page.mouse.down();

	const held = await read();

	await page.mouse.up();
	expect(hovered.star).not.toBe(rest.star);
	expect(hovered.glow).toBe(rest.glow);
	expect(held.star).toBe(hovered.star);
	expect(held.glow).not.toBe(rest.glow);
});
