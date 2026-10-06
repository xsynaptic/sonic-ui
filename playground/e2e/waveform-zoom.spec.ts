import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import type { Point } from './pointer.ts';

import { centerOf, mouseOnly } from './pointer.ts';

interface Heard {
	changes: number;
	scrollY: number;
	value: number;
	zoom: number;
	zooms: number;
}

async function openZoomable(page: Page): Promise<{ center: Point; waveform: Locator }> {
	await page.goto('/fixtures/');
	await page.addStyleTag({
		content: 'body::after { content: ""; display: block; block-size: 200vh; }',
	});

	const waveform = page.locator('#waveform-zoomable');
	const control = waveform.locator('.sonic-waveform');

	await control.scrollIntoViewIfNeeded();
	await waveform.evaluate((element) => {
		for (const [type, count] of [
			['change', 'changes'],
			['sonic-zoom', 'zooms'],
		] as const) {
			document.body.addEventListener(type, (event) => {
				if (event.target !== element) return;

				element.dataset[count] = String(Number(element.dataset[count] ?? 0) + 1);
			});
		}
	});

	return { center: await centerOf(control), waveform };
}

async function readOne(waveform: Locator, key: keyof Heard): Promise<number> {
	const heard = await readHeard(waveform);

	return heard[key];
}

function readHeard(waveform: Locator): Promise<Heard> {
	return waveform.evaluate((element) => ({
		changes: Number(element.dataset.changes ?? 0),
		scrollY: window.scrollY,
		value: Number(Reflect.get(element, 'value')),
		zoom: Number(Reflect.get(element, 'zoom')),
		zooms: Number(element.dataset.zooms ?? 0),
	}));
}

test.describe('by wheel', () => {
	test.skip(({ isMobile }) => isMobile, mouseOnly);

	test('a ctrl wheel zooms once, by the capped notch, and leaves the page where it was', async ({
		page,
	}) => {
		const { center, waveform } = await openZoomable(page);
		const before = await readHeard(waveform);

		await page.mouse.move(center.x, center.y);
		await page.keyboard.down('Control');
		await page.mouse.wheel(0, -100);
		await page.keyboard.up('Control');

		await expect.poll(() => readOne(waveform, 'zoom')).toBe(77.04);
		expect(await readHeard(waveform)).toEqual({ ...before, zoom: 77.04, zooms: 1 });
	});

	test('a plain wheel scrolls the page and leaves the zoom', async ({ page }) => {
		const { center, waveform } = await openZoomable(page);
		const before = await readHeard(waveform);

		await page.mouse.move(center.x, center.y);
		await page.mouse.wheel(0, 100);

		await expect.poll(() => readOne(waveform, 'scrollY')).toBeGreaterThan(before.scrollY);
		expect(await readHeard(waveform)).toMatchObject({ zoom: 60, zooms: 0 });
	});
});

test.describe('by pinch', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'Two fingers need CDP');
	test.use({ hasTouch: true });

	test('a second finger drops the scrub without a seek, the pair zooms, and the finger left down scrubs nothing', async ({
		page,
	}) => {
		const { center, waveform } = await openZoomable(page);
		const session = await page.context().newCDPSession(page);
		const touch = async (
			type: 'touchEnd' | 'touchMove' | 'touchStart',
			...fingers: Array<number>
		): Promise<void> => {
			await session.send('Input.dispatchTouchEvent', {
				touchPoints: fingers.map((x, id) => ({ id, x: center.x + x, y: center.y })),
				type,
			});
		};

		await touch('touchStart', -20);
		for (const x of [-30, -40, -50]) await touch('touchMove', x);
		await expect.poll(() => readOne(waveform, 'value')).toBeGreaterThan(150);

		await touch('touchStart', -50, 30);
		expect(await readOne(waveform, 'value')).toBe(150);

		for (const x of [40, 50, 60, 70]) await touch('touchMove', -50, x);
		await expect.poll(() => readOne(waveform, 'zoom')).toBe(90);

		await touch('touchEnd', -50);
		for (const x of [-70, -90, -110]) await touch('touchMove', x);
		await touch('touchEnd');

		const heard = await readHeard(waveform);

		expect(heard).toMatchObject({ changes: 0, value: 150, zoom: 90 });
		expect(heard.zooms).toBeGreaterThan(0);
	});
});
