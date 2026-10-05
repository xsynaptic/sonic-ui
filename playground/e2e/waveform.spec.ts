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

test("the wave's center paints the lit colour", async ({ page }) => {
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

test('the pending state follows a region in the window, clears when it lands or leaves, and waits out pending-delay', async ({
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

	await waveform.evaluate((element) => {
		element.setAttribute('pending-delay', '300');
		Object.assign(element, { pending: [[149, 152]] });
	});
	expect(await readPending()).toBe(false);
	await expect.poll(readPending).toBe(true);
});

test('a host tabindex of -1 leaves the tab order, and a press still focuses the waveform', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, 'A phone has no Tab key');

	const { canvas, waveform } = await openWaveform(page);
	const holdsFocus = (): Promise<boolean> =>
		waveform.evaluate((host) => host.contains(document.activeElement));

	await canvas.click();
	expect(await holdsFocus()).toBe(true);

	// WebKit walks back from the pressed canvas, and the stop before it is the control it sits in
	await page.keyboard.press('Tab');
	expect(await holdsFocus()).toBe(false);
	await page.keyboard.press('Shift+Tab');
	expect(await holdsFocus()).toBe(true);

	await waveform.evaluate((host) => {
		host.setAttribute('tabindex', '-1');
	});
	await page.keyboard.press('Tab');
	await page.keyboard.press('Shift+Tab');
	expect(await holdsFocus()).toBe(false);

	await canvas.click();
	expect(await holdsFocus()).toBe(true);
});

test('the playhead, ghost, label, readout and touch tokens each land on their own part, and the parked label keeps its insets from the wave', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const waveform = page.locator('#waveform-tokens');
	const playhead = waveform.locator('.sonic-waveform-playhead');
	const label = waveform.locator('.sonic-waveform-label').first();

	await waveform.locator('canvas').scrollIntoViewIfNeeded();
	await expect(playhead).toHaveCSS('inline-size', '1px');
	await expect(playhead).toHaveCSS('background-color', 'rgb(255, 0, 0)');
	await expect(waveform.locator('.sonic-waveform-ghost')).toHaveCSS(
		'background-color',
		'rgb(7, 8, 9)',
	);
	await expect(label).toHaveText('Intro');
	await expect(label).toHaveCSS('color', 'rgb(10, 11, 12)');
	await expect(label).toHaveCSS('background-color', 'rgb(4, 5, 6)');
	await expect(label).toHaveCSS('font-family', 'monospace');
	await expect(label).toHaveCSS('font-size', '14px');
	await expect(label).toHaveCSS('line-height', '21px');
	await expect(waveform.locator('.sonic-waveform-readout')).toHaveCSS('color', 'rgb(1, 2, 3)');
	await expect(waveform.locator('.sonic-waveform')).toHaveCSS('touch-action', 'none');

	const inline = await waveform.evaluate((host) => {
		const wave = host.querySelector('canvas')?.getBoundingClientRect();
		const parked = host.querySelector('.sonic-waveform-label');
		if (!wave || !parked) throw new Error('The waveform drew no label');

		const text = document.createRange();

		text.selectNodeContents(parked);

		return text.getBoundingClientRect().left - wave.left;
	});

	expect(inline).toBeCloseTo(16, 1);
	// 6rem of size: the glass's 0.06 inset and the label's 0.04, untouched by the inline token
	await expect(label).toHaveCSS('bottom', '9.6px');
});

test('a scrim spans the wave under the label, and a block inset lifts the label', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const waveform = page.locator('#waveform-pinned');
	const scrim = waveform.locator('.sonic-waveform-scrim');
	const label = waveform.locator('.sonic-waveform-label').first();

	await waveform.locator('canvas').scrollIntoViewIfNeeded();
	await expect(label).toHaveText('Intro');
	await expect(scrim).toHaveCSS('background-image', /rgb\(13, 14, 15\)/);

	const boxes = await waveform.evaluate((host) =>
		[...host.querySelectorAll('canvas, .sonic-waveform-scrim')].map((part) => {
			const { height, width, x, y } = part.getBoundingClientRect();

			return [x, y, width, height];
		}),
	);

	expect(boxes[1]).toEqual(boxes[0]);
	await expect(label).toHaveCSS('bottom', '14px');
});
