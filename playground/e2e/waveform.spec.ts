import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import {
	alphaAt,
	canvasPixels,
	expectPixel,
	middleOf,
	paintedColour,
	pixelAt,
} from './canvas-probe.ts';
import { drag, mouseOnly } from './pointer.ts';
import { readState } from './state.ts';

test.use({ deviceScaleFactor: 2 });

async function openWaveform(page: Page): Promise<{ canvas: Locator; waveform: Locator }> {
	await page.goto('/fixtures/');

	const waveform = page.locator('#waveform');
	const canvas = waveform.locator('canvas');

	// Out of view it holds its frames, and on a phone the fixture sits below the fold
	await canvas.scrollIntoViewIfNeeded();
	await expect.poll(async () => alphaAt(canvas, await middleOf(canvas))).toBe(255);

	return { canvas, waveform };
}

async function upperRow(canvas: Locator): Promise<string> {
	const width = await canvas.evaluate((element) =>
		element instanceof HTMLCanvasElement ? element.width : 0,
	);
	const columns = Array.from({ length: Math.floor(width / 2) }, (_column, index) => index * 2);

	return String(await canvasPixels(canvas, columns, 0.3));
}

function readPlayhead(waveform: Locator): Promise<string> {
	return waveform
		.locator('.sonic-waveform-playhead')
		.evaluate((line) => getComputedStyle(line).translate);
}

test("the wave's centre paints the lit colour", async ({ page }) => {
	const { canvas } = await openWaveform(page);
	const lit = await canvas.evaluate((element) =>
		getComputedStyle(element).getPropertyValue('--_sonic-lit'),
	);

	expectPixel(await pixelAt(canvas, await middleOf(canvas)), await paintedColour(canvas, lit));
});

test('a drag right walks back and seeks once', async ({ isMobile, page }) => {
	test.skip(isMobile, mouseOnly);

	const { canvas, waveform } = await openWaveform(page);

	await waveform.evaluate((element) => {
		element.addEventListener('change', () => {
			element.dataset.changes = String(Number(element.dataset.changes ?? 0) + 1);
		});
	});

	await drag(page, canvas, { x: 140, y: 0 });

	const { changes, value } = await waveform.evaluate((element) => ({
		changes: element.dataset.changes,
		value: Number(Reflect.get(element, 'value')),
	}));

	expect(value).toBeCloseTo(148, 5);
	expect(changes).toBe('1');
});

// A page from 146.2 seconds is almost four long, so a few hundred ms of play stays on it
test('under reduced motion the picture holds still while the playhead crosses it', async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });

	const { canvas, waveform } = await openWaveform(page);

	await waveform.evaluate((element) => {
		const startMs = performance.now();

		Object.assign(element, {
			playing: true,
			readTime: () => 147 + (performance.now() - startMs) / 1000,
			value: 147,
		});
	});

	let before = await upperRow(canvas);

	await expect
		.poll(async () => {
			const previous = before;

			before = await upperRow(canvas);

			return before === previous;
		})
		.toBe(true);

	const playheadBefore = await readPlayhead(waveform);

	await expect.poll(() => readPlayhead(waveform)).not.toBe(playheadBefore);
	expect(await upperRow(canvas)).toBe(before);
});

test('the pending state follows a region in the window, and clears when it lands or leaves', async ({
	page,
}) => {
	const { waveform } = await openWaveform(page);
	const setPending = async (pending: Array<[number, number]>): Promise<void> => {
		await waveform.evaluate((element, regions) => {
			Object.assign(element, { pending: regions });
		}, pending);
	};
	const readPending = (): Promise<boolean> => readState(waveform, 'pending');

	await setPending([[149, 151]]);
	await expect.poll(readPending).toBe(true);

	await setPending([]);
	await expect.poll(readPending).toBe(false);

	await setPending([[250, 260]]);
	await expect.poll(readPending).toBe(false);
});
