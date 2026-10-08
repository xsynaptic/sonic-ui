import type { Locator, Page } from '@playwright/test';

export interface Box {
	height: number;
	width: number;
	x: number;
	y: number;
}

export interface Point {
	x: number;
	y: number;
}

export const mouseOnly = 'The mouse drives this gesture';

export const noForcedColours = "Playwright's WebKit does not emulate forced colours";

export async function boxOf(target: Locator): Promise<Box> {
	const box = await target.boundingBox();
	if (!box) throw new Error('The target has no box');

	return box;
}

export async function centerOf(target: Locator): Promise<Point> {
	const box = await boxOf(target);

	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function drag(page: Page, target: Locator, by: Point): Promise<void> {
	const start = await centerOf(target);

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + by.x, start.y + by.y, { steps: 4 });
	await page.mouse.up();
}
