import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import type { Point } from './pointer.ts';

import { boxOf, centerOf } from './pointer.ts';
import { valueNow } from './state.ts';

test.skip(({ browserName }) => browserName !== 'chromium', 'A touch swipe needs CDP');
test.use({ hasTouch: true, viewport: { height: 400, width: 400 } });

async function swipe(page: Page, from: Point, to: Point): Promise<void> {
	const session = await page.context().newCDPSession(page);
	const moves = 10;

	await session.send('Input.dispatchTouchEvent', { touchPoints: [from], type: 'touchStart' });
	for (let move = 1; move <= moves; move += 1) {
		const x = from.x + ((to.x - from.x) * move) / moves;
		const y = from.y + ((to.y - from.y) * move) / moves;

		await session.send('Input.dispatchTouchEvent', { touchPoints: [{ x, y }], type: 'touchMove' });
	}
	await session.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' });
}

async function centerInView(page: Page, selector: string): Promise<Point> {
	const target = page.locator(selector);

	await target.scrollIntoViewIfNeeded();

	return centerOf(target);
}

test('a mostly vertical swipe from a horizontal slider scrolls the page and leaves the value', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const from = await centerInView(page, '#send .sonic-slider');
	const scrolled = await page.evaluate(() => window.scrollY);

	await swipe(page, from, { x: from.x + 30, y: from.y - 150 });

	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrolled);
	await expect(page.getByRole('slider', { name: 'Send' })).toHaveAttribute('aria-valuenow', '0');
});

test('a horizontal swipe on a horizontal slider moves the value and not the page', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const from = await centerInView(page, '#send .sonic-slider');
	const scrolled = await page.evaluate(() => window.scrollY);

	await swipe(page, from, { x: from.x + 60, y: from.y });

	const slider = page.getByRole('slider', { name: 'Send' });

	await expect.poll(() => valueNow(slider)).toBeGreaterThan(0);
	expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
});

test('a swipe on an XY pad moves both values and never the page', async ({ page }) => {
	await page.goto('/fixtures/');

	const from = await centerInView(page, '#xy .sonic-xy-puck');
	const scrolled = await page.evaluate(() => window.scrollY);

	await swipe(page, from, { x: from.x + 30, y: from.y - 30 });

	const pad = page.getByRole('slider', { exact: true, name: 'Pad' });

	await expect.poll(() => valueNow(pad)).toBeGreaterThan(50);
	await expect(pad).toHaveAttribute('aria-valuetext', /^X \d+, Y (5[1-9]|[6-9]\d)$/);
	expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
});

// Room to pan both ways from any control, wherever it sits in the document
const roomToPan =
	'body::after { content: ""; display: block; inline-size: 300vw; block-size: 200vh; }';

function readScroll(page: Page): Promise<Point> {
	return page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
}

async function readScrollAlong(page: Page, axis: 'x' | 'y'): Promise<number> {
	const scroll = await readScroll(page);

	return scroll[axis];
}

for (const { name, role, selector, value } of [
	{ name: 'Level', role: 'slider', selector: '#level .sonic-dial', value: '50' },
	{ name: 'Fader', role: 'slider', selector: '#fader .sonic-slider', value: '0' },
	{ name: 'Tempo', role: 'spinbutton', selector: '#tempo .sonic-number', value: '120' },
] as const) {
	test(`a mostly sideways swipe from ${name}, which drags up and down, scrolls the page and leaves the value`, async ({
		page,
	}) => {
		await page.goto('/fixtures/');
		await page.addStyleTag({ content: roomToPan });

		const from = await centerInView(page, selector);
		const scrolled = await readScroll(page);

		await swipe(page, from, { x: from.x - 150, y: from.y - 30 });

		await expect.poll(() => readScrollAlong(page, 'x')).toBeGreaterThan(scrolled.x);
		await expect(page.getByRole(role, { name })).toHaveAttribute('aria-valuenow', value);
	});
}

for (const { name, selector } of [
	{ name: 'Position', selector: '#wavestrip .sonic-wavestrip' },
	{ name: 'Detail', selector: '#waveform .sonic-waveform' },
	{ name: 'Zoomable', selector: '#waveform-zoomable .sonic-waveform' },
]) {
	test(`a mostly vertical swipe from ${name}, off its center, scrolls the page and leaves the value`, async ({
		page,
	}) => {
		await page.goto('/fixtures/');
		await page.addStyleTag({ content: roomToPan });

		const center = await centerInView(page, selector);
		const from = { x: center.x - 60, y: center.y };
		const scrolled = await readScroll(page);

		await swipe(page, from, { x: from.x + 30, y: from.y - 150 });

		await expect.poll(() => readScrollAlong(page, 'y')).toBeGreaterThan(scrolled.y);
		await expect(page.getByRole('slider', { name })).toHaveAttribute('aria-valuenow', '150');
	});
}

test('a swipe on an envelope handle turns its dials and never the page, and one beside it scrolls', async ({
	page,
}) => {
	await page.goto('/fixtures/');
	await page.addStyleTag({ content: roomToPan });

	const decay = page.getByRole('slider', { exact: true, name: 'Envelope decay' });
	const handle = await centerInView(
		page,
		'#envelope .sonic-envelope-handle[data-sonic-stage="decay"]',
	);
	const scrolled = await readScroll(page);

	await swipe(page, handle, { x: handle.x + 30, y: handle.y - 30 });

	await expect.poll(() => valueNow(decay)).toBeGreaterThan(45);
	expect(await readScroll(page)).toEqual(scrolled);

	const held = await decay.getAttribute('aria-valuenow');
	const box = await boxOf(page.locator('#envelope .sonic-envelope'));

	const offHandle = { x: box.x + box.width - 20, y: box.y + 20 };

	await swipe(page, offHandle, { x: offHandle.x + 30, y: offHandle.y - 150 });

	await expect.poll(() => readScrollAlong(page, 'y')).toBeGreaterThan(scrolled.y);
	await expect(decay).toHaveAttribute('aria-valuenow', held ?? '');
});
