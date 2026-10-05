import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { alphaAt, canvasPixels, expectPixel, paintedColour, pixelAt } from './canvas-probe.ts';
import { readState } from './state.ts';

// At DPR 2 the default 3px pitch and 0.33 gap make 6 device px a bar: 4 drawn, then 2 of gap
const pitch = 6;
const bar = 4;

test.use({ deviceScaleFactor: 2 });

async function openWavestrip(page: Page): Promise<{ canvas: Locator; wavestrip: Locator }> {
	await page.goto('/fixtures/');

	const wavestrip = page.locator('#wavestrip');
	const canvas = wavestrip.locator('canvas');

	// Out of view it holds its frames, and on a phone the fixture sits below the fold
	await canvas.scrollIntoViewIfNeeded();

	await expect.poll(() => alphaAt(canvas, 1)).toBe(255);

	return { canvas, wavestrip };
}

function readWidth(canvas: Locator): Promise<{ css: number; device: number }> {
	return canvas.evaluate((element) => {
		if (!(element instanceof HTMLCanvasElement)) throw new Error('Not a canvas');

		return { css: element.getBoundingClientRect().width, device: element.width };
	});
}

test('the canvas backs every device pixel, bars and gaps land where the grid puts them, and the played side paints the lit colour and the rest the wave colour', async ({
	page,
}) => {
	const { canvas } = await openWavestrip(page);
	const { css, device } = await readWidth(canvas);
	const edgeBar = Math.floor(device / 2 / pitch);
	const [inBar, inGap, played, unplayed] = await canvasPixels(canvas, [
		10 * pitch + 1,
		10 * pitch + bar,
		(edgeBar - 4) * pitch + 1,
		(edgeBar + 4) * pitch + 1,
	]);
	const lit = await canvas.evaluate((element) =>
		getComputedStyle(element).getPropertyValue('--_sonic-lit'),
	);
	const wave = await canvas.evaluate((element) =>
		getComputedStyle(element).getPropertyValue('--_sonic-wavestrip-wave'),
	);

	expect(Math.abs(device - css * 2)).toBeLessThanOrEqual(1);
	expect(inBar?.[3]).toBe(255);
	expect(inGap?.[3]).toBe(0);
	expectPixel(played, await paintedColour(canvas, lit));
	expectPixel(unplayed, await paintedColour(canvas, wave));
});

function setOnBox(page: Page, tokens: Record<string, string>): Promise<void> {
	return page.evaluate(async (entries) => {
		const box = document.querySelector<HTMLElement>('#wavestrip-box');

		for (const [name, value] of entries) box?.style.setProperty(name, value);
		for (let frame = 0; frame < 2; frame += 1) {
			await new Promise((resolve) => requestAnimationFrame(resolve));
		}
	}, Object.entries(tokens));
}

test('a lit colour set on an ancestor repaints within two frames, as does an ink of currentcolor, from the text colour on the glass', async ({
	page,
}) => {
	const { canvas } = await openWavestrip(page);
	const { device } = await readWidth(canvas);

	await setOnBox(page, { '--sonic-lit': '#0080ff' });
	expectPixel(await pixelAt(canvas, 1), [0, 128, 255, 255]);

	await setOnBox(page, { '--sonic-glass-text': '#0080ff', '--sonic-ink': 'currentcolor' });

	const unlit = await canvas.evaluate((element) =>
		getComputedStyle(element).getPropertyValue('--_sonic-unlit'),
	);

	expectPixel(
		await pixelAt(canvas, (Math.floor(device / 2 / pitch) + 4) * pitch + 1),
		await paintedColour(canvas, `color-mix(in oklab, #0080ff 30%, ${unlit})`),
	);
});

test('empty peaks draw a plain groove, set the empty state, and a ratio of 0 leaves only the glass', async ({
	page,
}) => {
	const { canvas, wavestrip } = await openWavestrip(page);
	const { device } = await readWidth(canvas);
	const middle = Math.floor(device / 2);

	await wavestrip.evaluate((element) => {
		Object.assign(element, { peaks: [] });
	});

	const alphaNearTop = async (): Promise<number | undefined> => {
		const [pixel] = await canvasPixels(canvas, [middle], 0.1);

		return pixel?.[3];
	};

	await expect
		.poll(async () => [await alphaNearTop(), await alphaAt(canvas, middle)])
		.toEqual([0, 255]);
	expect(await readState(wavestrip, 'empty')).toBe(true);

	await wavestrip.evaluate((element) => {
		element.style.setProperty('--sonic-wavestrip-groove-ratio', '0');
		element.toggleAttribute('dimmed', true);
	});
	await expect.poll(() => alphaAt(canvas, middle)).toBe(0);
});

test('a groove size sets the empty groove in CSS pixels, whatever the ratio', async ({ page }) => {
	const { canvas, wavestrip } = await openWavestrip(page);
	const { device } = await readWidth(canvas);
	const alphaAtRow = async (rowFraction: number): Promise<number | undefined> => {
		const [pixel] = await canvasPixels(canvas, [Math.floor(device / 2)], rowFraction);

		return pixel?.[3];
	};

	// 20px of a 44.8px wave reaches a row the default 0.15 ratio leaves clear
	await wavestrip.evaluate((element) => {
		element.style.setProperty('--sonic-wavestrip-groove-size', '20px');
		element.toggleAttribute('dimmed', true);
		Object.assign(element, { peaks: [] });
	});

	await expect.poll(async () => [await alphaAtRow(0.2), await alphaAtRow(0.35)]).toEqual([0, 255]);
});

test('a long readout stays inside the strip at both ends, on one line and on glass of its own colour, and an empty string hides it', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, 'Touch shows the readout only once a drag reveals it');

	const { wavestrip } = await openWavestrip(page);
	const strip = await wavestrip.locator('.sonic-wavestrip').boundingBox();
	if (!strip) throw new Error('The wavestrip has no box');

	const readout = wavestrip.locator('.sonic-wavestrip-readout');
	const middle = strip.y + strip.height / 2;

	await wavestrip.evaluate((element) => {
		element.style.setProperty('--sonic-glass', 'transparent');
		element.style.setProperty('--sonic-readout-glass', 'rgb(10 20 30)');
		Object.assign(element, { formatValue: () => '1:15 A title far longer than any number' });
	});
	await page.mouse.move(strip.x + 14, middle);
	await expect(readout).toBeVisible();

	const atStart = await readout.boundingBox();

	expect(atStart?.x).toBeCloseTo(strip.x, 0);

	await page.mouse.move(strip.x + strip.width - 14, middle);

	const atEnd = await readout.boundingBox();

	expect((atEnd?.x ?? 0) + (atEnd?.width ?? 0)).toBeCloseTo(strip.x + strip.width, 0);

	await page.mouse.move(strip.x + strip.width / 2, middle);

	const look = await readout.evaluate((bubble) => ({
		fill: getComputedStyle(bubble).backgroundColor,
		isOneLine: bubble.scrollHeight <= bubble.clientHeight,
		strip: getComputedStyle(bubble.parentElement ?? bubble).backgroundColor,
	}));

	expect(look).toEqual({ fill: 'rgb(10, 20, 30)', isOneLine: true, strip: 'rgba(0, 0, 0, 0)' });

	await wavestrip.evaluate((element) => {
		Object.assign(element, { formatValue: () => '' });
	});
	await page.mouse.move(strip.x + strip.width / 2 + 10, middle);
	await expect(readout).toBeHidden();
});

test('a cancellable drag past its zone matches cancelling, and revealed only while inside', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, 'The mouse drives this gesture');

	const { wavestrip } = await openWavestrip(page);
	const strip = await wavestrip.locator('.sonic-wavestrip').boundingBox();
	if (!strip) throw new Error('The wavestrip has no box');

	const states = async (): Promise<Array<boolean>> => [
		await readState(wavestrip, 'revealed'),
		await readState(wavestrip, 'cancelling'),
	];
	const x = strip.x + strip.width / 4;
	const y = strip.y + strip.height / 2;

	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + 20, y, { steps: 2 });
	expect(await states()).toEqual([true, false]);

	await page.mouse.move(x + 20, y - strip.height - 80, { steps: 2 });
	expect(await states()).toEqual([false, true]);

	await page.mouse.up();
	expect(await states()).toEqual([false, false]);
	await expect(wavestrip).toHaveJSProperty('value', 150);
});

test('with fill, the strip takes its row and its ratios follow the height, while a marker size holds the dots still and sets their lanes', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const strip = page.locator('#wavestrip-fill .sonic-wavestrip');
	const dots = page.locator('#wavestrip-fill .sonic-wavestrip-marker');

	await strip.scrollIntoViewIfNeeded();
	await expect(strip).toHaveCSS('block-size', '96px');
	await expect(strip).toHaveCSS('padding-top', '9.6px');
	await expect(dots.first()).toHaveCSS('inline-size', '4px');

	// 6.7px apart: one lane for 4px dots, where the 96px strip's own 6.2px dots would take two
	const tops = await dots.evaluateAll((parts) => parts.map((part) => getComputedStyle(part).top));

	expect(tops).toEqual(['0px', '0px']);

	await page.locator('#wavestrip-fill-box').evaluate((box) => {
		box.style.setProperty('height', '48px');
	});
	await expect(strip).toHaveCSS('block-size', '48px');
	await expect(strip).toHaveCSS('padding-top', '4.8px');
	await expect(dots.first()).toHaveCSS('inline-size', '4px');
});

test('the hover readout opens over the pointer, and Escape dismisses it', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, 'Touch shows the readout only once a drag reveals it');

	const { canvas, wavestrip } = await openWavestrip(page);
	const box = await canvas.boundingBox();
	if (!box) throw new Error('The wavestrip has no box');

	const pointerX = box.x + box.width / 4;

	await page.mouse.move(pointerX, box.y + box.height / 2);

	const readout = wavestrip.locator('.sonic-wavestrip-readout');

	await expect(readout).toBeVisible();

	const bubble = await readout.boundingBox();

	expect(Math.abs((bubble?.x ?? 0) + (bubble?.width ?? 0) / 2 - pointerX)).toBeLessThanOrEqual(1.5);

	await page.keyboard.press('Escape');
	await expect(readout).toBeHidden();

	await page.mouse.move(pointerX + 10, box.y + box.height / 2);
	await expect(readout).toBeHidden();
});

test('a press reports dragging by its first input, and the hovered value returns on a release inside', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, 'Touch reports no hovered value');

	const { canvas, wavestrip } = await openWavestrip(page);
	const box = await canvas.boundingBox();
	if (!box) throw new Error('The wavestrip has no box');

	const read = (name: 'hoverValue' | 'value'): Promise<unknown> =>
		wavestrip.evaluate((element, property) => {
			const value: unknown = Reflect.get(element, property);

			return value;
		}, name);
	const x = box.x + box.width / 4;
	const y = box.y + box.height / 2;

	await wavestrip.evaluate((element) => {
		element.addEventListener(
			'input',
			() => {
				element.dataset.pressed = String(element.matches(':state(dragging)'));
			},
			{ once: true },
		);
	});
	await page.mouse.move(x, y);
	await page.mouse.down();
	expect(await wavestrip.getAttribute('data-pressed')).toBe('true');
	expect(await read('hoverValue')).toBeUndefined();

	await page.mouse.up();
	expect(await read('hoverValue')).toBe(await read('value'));

	await page.mouse.down();
	await page.mouse.move(x + 20, box.y + box.height + 30, { steps: 2 });
	await page.mouse.up();
	expect(await read('hoverValue')).toBeUndefined();
});

async function pressBy(page: Page, dot: Locator, by: { x: number; y: number }): Promise<void> {
	const box = await dot.boundingBox();
	if (!box) throw new Error('The marker has no box');

	await page.mouse.click(box.x + box.width / 2 + by.x, box.y + box.height / 2 + by.y);
}

function readValue(wavestrip: Locator): Promise<number> {
	return wavestrip.evaluate((element) => ('value' in element ? Number(element.value) : NaN));
}

test('a press on a dot snaps to its marker, in whichever lane it sits, and a press below a dot seeks to where it lands', async ({
	page,
}) => {
	const { wavestrip } = await openWavestrip(page);
	const dots = wavestrip.locator('.sonic-wavestrip-marker');
	const [first, second] = await Promise.all([dots.nth(0).boundingBox(), dots.nth(1).boundingBox()]);

	expect(second?.y).toBeGreaterThan((first?.y ?? 0) + (first?.height ?? 0));

	await pressBy(page, dots.nth(0), { x: -3, y: 0 });
	expect(await readValue(wavestrip)).toBe(60);

	await pressBy(page, dots.nth(1), { x: 3, y: 0 });
	expect(await readValue(wavestrip)).toBe(62);

	await pressBy(page, dots.nth(0), { x: -3, y: 20 });

	const value = await readValue(wavestrip);

	expect(value).toBeGreaterThan(55);
	expect(value).toBeLessThan(59);
});
