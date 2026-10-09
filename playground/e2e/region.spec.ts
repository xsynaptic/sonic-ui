import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { canvasPixels } from './canvas-probe.ts';
import { systemColour } from './colour.ts';
import { boxOf, centerOf, noForcedColours } from './pointer.ts';
import { readState, valueNow } from './state.ts';

// At DPR 2 the default 3px pitch makes 6 device px a bar
const pitch = 6;

test.use({ deviceScaleFactor: 2 });

interface Strip {
	box: Locator;
	canvas: Locator;
	part: Locator;
	region: Locator;
	wavestrip: Locator;
}

// The fixture's region runs from 120 to 180 of 300, so its body straddles the strip's center
async function openStrip(page: Page): Promise<Strip> {
	await page.goto('/fixtures/');

	const wavestrip = page.locator('#wavestrip-region');
	const canvas = wavestrip.locator('canvas');

	await canvas.scrollIntoViewIfNeeded();

	return {
		box: wavestrip.locator('.sonic-wavestrip'),
		canvas,
		part: wavestrip.locator('.sonic-region'),
		region: wavestrip.locator('sonic-region'),
		wavestrip,
	};
}

function readSpan(region: Locator): Promise<Array<number>> {
	return region.evaluate((element) =>
		'start' in element && 'end' in element ? [Number(element.start), Number(element.end)] : [],
	);
}

// A transparent shadow computes to a colour and four zeros, not to `none`
async function isGlowing(target: Locator): Promise<boolean> {
	const shadow = await target.evaluate((element) => getComputedStyle(element).boxShadow);

	return !/^(none|rgba\(0, 0, 0, 0\))/.test(shadow);
}

test(
	'a drag from inside the bracket moves it and its frame, keeps its length and leaves the playhead',
	{ tag: '@mobile' },
	async ({ page }) => {
		const { box, canvas, part, region } = await openStrip(page);
		const center = await centerOf(box);
		const drawn = await boxOf(part);
		const { width } = await boxOf(box);

		await page.mouse.move(center.x, center.y);
		await page.mouse.down();
		expect(await readState(region, 'dragging')).toBe(true);

		await page.mouse.move(center.x + 48, center.y, { steps: 4 });
		await page.mouse.up();

		const [start = NaN, end = NaN] = await readSpan(region);
		const moved = await boxOf(part);

		expect(start).toBeCloseTo(120 + (48 * 300) / width, 1);
		expect(end - start).toBeCloseTo(60, 6);
		expect(moved.x - drawn.x).toBeCloseTo(48, 0);
		expect(moved.width).toBeCloseTo(drawn.width, 1);
		expect(await valueNow(canvas)).toBe(30);
		expect(await readState(region, 'dragging')).toBe(false);
	},
);

test(
	'a press let go inside the bracket seeks to where it landed and leaves the bracket',
	{ tag: '@mobile' },
	async ({ page }) => {
		const { box, canvas, region } = await openStrip(page);
		const center = await centerOf(box);

		await page.mouse.click(center.x, center.y);

		expect(await valueNow(canvas)).toBeCloseTo(150, 0);
		expect(await readSpan(region)).toEqual([120, 180]);
	},
);

test('Tab goes from the strip to its region, an arrow moves the region alone, and each glows over its own box', async ({
	page,
}) => {
	const { box, canvas, part, region } = await openStrip(page);
	await canvas.focus();
	await page.keyboard.press('Shift');
	expect(await isGlowing(canvas)).toBe(true);
	expect(await boxOf(canvas)).toEqual(await boxOf(box));

	await page.keyboard.press('Tab');
	await expect(part).toBeFocused();
	expect(await isGlowing(part)).toBe(true);
	expect(await isGlowing(canvas)).toBe(false);

	await page.keyboard.press('ArrowRight');
	expect(await readSpan(region)).toEqual([123, 183]);
	expect(await valueNow(canvas)).toBe(30);
	await expect(part).toHaveAttribute('aria-valuenow', '123');
});

test('a preview paints the bars between the playhead and itself in the scrub colour', async ({
	page,
}) => {
	const { canvas, wavestrip } = await openStrip(page);
	// 30% along, between a playhead at 10% and a preview at 50%
	const column = Math.floor((576 * 0.3) / pitch) * pitch + 1;
	const pixel = async (): Promise<string> => {
		const [read] = await canvasPixels(canvas, [column]);

		return String(read);
	};

	await wavestrip.evaluate((element) => {
		element.style.setProperty('--sonic-unplayed', 'rgb(10 20 200)');
		element.style.setProperty('--sonic-scrub', 'rgb(200 30 40)');
	});
	await expect.poll(pixel).toBe('10,20,200,255');

	await wavestrip.evaluate((element) => {
		Object.assign(element, { preview: 150 });
	});
	await expect.poll(pixel).toBe('200,30,40,255');

	await wavestrip.evaluate((element) => {
		Object.assign(element, { preview: undefined });
	});
	await expect.poll(pixel).toBe('10,20,200,255');
});

test('in forced colours the bracket draws in CanvasText and a disabled one in GrayText', async ({
	browserName,
	page,
}) => {
	test.skip(browserName === 'webkit', noForcedColours);
	await page.emulateMedia({ forcedColors: 'active' });

	const { part, region } = await openStrip(page);
	const bracket = part.locator('.sonic-region-bracket');

	await expect(bracket).toHaveCSS('border-top-color', await systemColour(page, 'CanvasText'));

	await region.evaluate((element) => {
		element.toggleAttribute('disabled', true);
	});
	await expect(bracket).toHaveCSS('border-top-color', await systemColour(page, 'GrayText'));
	await expect(part).not.toHaveAttribute('tabindex');
});
