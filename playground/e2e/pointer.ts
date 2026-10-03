import type { Locator, Page } from '@playwright/test';

export interface Point {
	x: number;
	y: number;
}

export const mouseOnly = 'The mouse drives this gesture';

export async function centreOf(target: Locator): Promise<Point> {
	const box = await target.boundingBox();
	if (!box) throw new Error('The target has no box');

	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function drag(page: Page, target: Locator, by: Point): Promise<void> {
	const start = await centreOf(target);

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + by.x, start.y + by.y, { steps: 4 });
	await page.mouse.up();
}
