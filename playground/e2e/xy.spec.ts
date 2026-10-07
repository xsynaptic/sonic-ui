import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import type { Box } from './pointer.ts';

import { boxOf, centerOf, mouseOnly } from './pointer.ts';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
	await page.locator('#xy .sonic-xy').evaluate((pad) => {
		pad.scrollIntoView({ block: 'center' });
	});
});

function readValues(page: Page): Promise<Array<null | string>> {
	return page
		.locator('#xy .sonic-xy-axis')
		.evaluateAll((parts) => parts.map((part) => part.getAttribute('aria-valuenow')));
}

function expectInside(inner: Box, outer: Box): void {
	expect(inner.x).toBeGreaterThanOrEqual(outer.x);
	expect(inner.y).toBeGreaterThanOrEqual(outer.y);
	expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
	expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
}

test('a drag from the puck moves both values, and the puck travels to the corners of the pad and no further', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const pad = await boxOf(page.locator('#xy .sonic-xy'));
	const puck = page.locator('#xy .sonic-xy-puck');
	const start = await centerOf(puck);

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + 20, start.y - 10, { steps: 4 });

	const values = await readValues(page);
	const [x = 0, y = 0] = values.map(Number);

	expect(x).toBeGreaterThan(50);
	expect(y).toBeGreaterThan(50);
	expect(x).toBeGreaterThan(y);

	await page.mouse.move(pad.x + pad.width + 60, pad.y - 60, { steps: 4 });
	expect(await readValues(page)).toEqual(['100', '100']);

	const atEnd = await boxOf(puck);

	expect(atEnd.x + atEnd.width).toBeCloseTo(pad.x + pad.width, 1);
	expect(atEnd.y).toBeCloseTo(pad.y, 1);

	await page.mouse.move(pad.x - 60, pad.y + pad.height + 60, { steps: 4 });
	await page.mouse.up();
	expect(await readValues(page)).toEqual(['0', '0']);

	const atStart = await boxOf(puck);

	expect(atStart.x).toBeCloseTo(pad.x, 1);
	expect(atStart.y + atStart.height).toBeCloseTo(pad.y + pad.height, 1);
});

test("a press on the field reports dragging by its first input and brings the puck's center under the pointer, and a corner clamps it inside", async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const xy = page.locator('#xy');
	const pad = await boxOf(page.locator('#xy .sonic-xy'));
	const puck = page.locator('#xy .sonic-xy-puck');
	// Whole pixels, since Firefox and WebKit round the pointer
	const at = {
		x: Math.round(pad.x + pad.width * 0.3),
		y: Math.round(pad.y + pad.height * 0.25),
	};

	await xy.evaluate((element) => {
		element.addEventListener(
			'input',
			() => {
				element.dataset.pressed = String(element.matches(':state(dragging)'));
			},
			{ once: true },
		);
	});
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	expect(await xy.getAttribute('data-pressed')).toBe('true');

	await page.mouse.up();

	const center = await centerOf(puck);

	expect(Math.abs(center.x - at.x)).toBeLessThanOrEqual(1);
	expect(Math.abs(center.y - at.y)).toBeLessThanOrEqual(1);
	await expect(page.locator('#xy [data-sonic-axis="x"]')).toBeFocused();

	await page.mouse.click(pad.x + pad.width - 6, pad.y + 6);
	expect(await readValues(page)).toEqual(['100', '100']);
	expectInside(await boxOf(puck), pad);
});

test('a disabled XY pad takes no press and no focus', async ({ isMobile, page }) => {
	test.skip(isMobile, mouseOnly);

	const pad = await boxOf(page.locator('#xy-disabled .sonic-xy'));

	await page.mouse.click(pad.x + 10, pad.y + 10);

	await expect(page.locator('#xy-disabled [data-sonic-axis="x"]')).toHaveAttribute(
		'aria-valuenow',
		'30',
	);
	await expect(page.locator('#xy-disabled .sonic-xy-axis:focus')).toHaveCount(0);
});
