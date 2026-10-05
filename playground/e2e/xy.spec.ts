import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { centreOf, mouseOnly } from './pointer.ts';

interface Box {
	height: number;
	width: number;
	x: number;
	y: number;
}

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
	await page.locator('#xy .sonic-xy').evaluate((glass) => {
		glass.scrollIntoView({ block: 'center' });
	});
});

async function boxOf(target: Locator): Promise<Box> {
	const box = await target.boundingBox();
	if (!box) throw new Error('The target has no box');

	return box;
}

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

test('a drag from the puck moves both values, and the puck stays inside the glass at both corners', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const glass = await boxOf(page.locator('#xy .sonic-xy'));
	const puck = page.locator('#xy .sonic-xy-puck');
	const start = await centreOf(puck);

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + 20, start.y - 10, { steps: 4 });

	const values = await readValues(page);
	const [x = 0, y = 0] = values.map(Number);

	expect(x).toBeGreaterThan(50);
	expect(y).toBeGreaterThan(50);
	expect(x).toBeGreaterThan(y);

	await page.mouse.move(glass.x + glass.width + 60, glass.y - 60, { steps: 4 });
	expect(await readValues(page)).toEqual(['100', '100']);
	expectInside(await boxOf(puck), glass);

	await page.mouse.move(glass.x - 60, glass.y + glass.height + 60, { steps: 4 });
	await page.mouse.up();
	expect(await readValues(page)).toEqual(['0', '0']);
	expectInside(await boxOf(puck), glass);
});

test("a press on the glass brings the puck's centre under the pointer, and a corner clamps it inside", async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const glass = await boxOf(page.locator('#xy .sonic-xy'));
	const puck = page.locator('#xy .sonic-xy-puck');
	const at = { x: glass.x + glass.width * 0.3, y: glass.y + glass.height * 0.25 };

	await page.mouse.click(at.x, at.y);

	const centre = await centreOf(puck);

	expect(Math.abs(centre.x - at.x)).toBeLessThanOrEqual(1);
	expect(Math.abs(centre.y - at.y)).toBeLessThanOrEqual(1);
	await expect(page.locator('#xy [data-sonic-axis="x"]')).toBeFocused();

	await page.mouse.click(glass.x + glass.width - 6, glass.y + 6);
	expect(await readValues(page)).toEqual(['100', '100']);
	expectInside(await boxOf(puck), glass);
});

test('a press on the glass reports dragging by its first input', async ({ isMobile, page }) => {
	test.skip(isMobile, mouseOnly);

	const xy = page.locator('#xy');
	const glass = await boxOf(page.locator('#xy .sonic-xy'));

	await xy.evaluate((element) => {
		element.addEventListener(
			'input',
			() => {
				element.dataset.pressed = String(element.matches(':state(dragging)'));
			},
			{ once: true },
		);
	});
	await page.mouse.move(glass.x + glass.width * 0.3, glass.y + glass.height * 0.25);
	await page.mouse.down();
	expect(await xy.getAttribute('data-pressed')).toBe('true');

	await page.mouse.up();
});

test('a disabled XY pad takes no press and no focus', async ({ isMobile, page }) => {
	test.skip(isMobile, mouseOnly);

	const glass = await boxOf(page.locator('#xy-disabled .sonic-xy'));

	await page.mouse.click(glass.x + 10, glass.y + 10);

	await expect(page.locator('#xy-disabled [data-sonic-axis="x"]')).toHaveAttribute(
		'aria-valuenow',
		'30',
	);
	await expect(page.locator('#xy-disabled .sonic-xy-axis:focus')).toHaveCount(0);
});
