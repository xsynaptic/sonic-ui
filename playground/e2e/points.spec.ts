import { expect, test } from '@playwright/test';

import { mouseOnly } from './pointer.ts';

const points = [
	'#envelope .sonic-envelope-handle[data-sonic-stage="decay"]',
	'#envelope-curves .sonic-envelope-curve[data-sonic-stage="decay"]',
];

function isClear(paint: string): boolean {
	return /^(?:rgba?|oklab)\([^)]*[,/] ?0\)/.test(paint);
}

for (const selector of points) {
	test(`a point on glass brightens on hover and keeps its ring while held: ${selector}`, async ({
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
		expect(rest.core).toBe(rest.ring);
		expect(hovered.ring).not.toBe(rest.ring);
		expect(hovered.core).toBe(hovered.ring);
		expect(held.ring).toBe(rest.ring);
	});
}

test('a held handle is a hollow ring, and a relief skin gives it a glow, not a bracket', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	await page.goto('/fixtures/');
	await page.addStyleTag({ content: '*, *::after { transition: none !important; }' });

	const handle = page.locator(points[0] ?? '');
	const read = () =>
		handle.evaluate((element) => {
			const style = getComputedStyle(element);

			return {
				bracket: getComputedStyle(element, '::after').borderBottomColor,
				core: style.backgroundColor,
				halo: style.boxShadow,
				ring: style.borderTopColor,
			};
		});

	await handle.hover();
	await page.mouse.down();

	const held = await read();

	await page.mouse.up();
	await handle.evaluate((element) => {
		element.closest<HTMLElement>('sonic-envelope')?.style.setProperty('--sonic-relief', '0');
	});
	await handle.hover();
	await page.mouse.down();

	const heldFlat = await read();

	await page.mouse.up();
	expect(held.core).not.toBe(held.ring);
	expect(isClear(held.halo)).toBe(false);
	expect(isClear(held.bracket)).toBe(true);
	expect(isClear(heldFlat.halo)).toBe(true);
	expect(isClear(heldFlat.bracket)).toBe(false);
});

test('the puck lifts on hover and is a glowing hollow ring while held', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	await page.goto('/fixtures/');
	await page.addStyleTag({ content: '*, *::before { transition: none !important; }' });

	const puck = page.locator('#xy .sonic-xy-puck');
	const read = () =>
		puck.evaluate((element) => {
			const disc = getComputedStyle(element, '::before');

			return {
				edge: disc.borderTopColor,
				fill: disc.backgroundColor,
				glow: getComputedStyle(element).filter,
			};
		});
	const rest = await read();

	await puck.hover();

	const hovered = await read();

	await page.mouse.down();

	const held = await read();

	await page.mouse.up();
	expect(hovered.fill).not.toBe(rest.fill);
	expect(hovered.glow).toBe(rest.glow);
	expect(held.fill).not.toBe(rest.fill);
	expect(held.fill).not.toBe(hovered.fill);
	expect(held.edge).toBe(rest.edge);
	expect(held.glow).not.toBe(rest.glow);
});
