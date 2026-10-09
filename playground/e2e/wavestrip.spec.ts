import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { alphaAt, canvasPixels, paintedColour, pixelAt, softPixel } from './canvas-probe.ts';
import { clear, systemColour } from './colour.ts';
import { boxOf, noForcedColours } from './pointer.ts';
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

function setOnBox(page: Page, tokens: Record<string, string>): Promise<void> {
	return page.evaluate(async (entries) => {
		const box = document.querySelector<HTMLElement>('#wavestrip-box');

		for (const [name, value] of entries) box?.style.setProperty(name, value);
		for (let frame = 0; frame < 2; frame += 1) {
			await new Promise((resolve) => requestAnimationFrame(resolve));
		}
	}, Object.entries(tokens));
}

test(
	'the wavestrip paints its bars on the device grid in the lit and wave colours, and repaints when either changes',
	{ tag: '@mobile' },
	async ({ page }) => {
		const { canvas } = await openWavestrip(page);

		await test.step('the canvas backs every device pixel, bars and gaps land where the grid puts them, and the played side paints the lit colour and the rest the wave colour', async () => {
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
			const wave = await canvas.evaluate((element) => {
				const style = getComputedStyle(element);

				return style
					.getPropertyValue('--_sonic-wavestrip-wave')
					.replaceAll('currentcolor', () => style.color);
			});

			expect.soft(Math.abs(device - css * 2)).toBeLessThanOrEqual(1);
			expect.soft(inBar?.[3]).toBe(255);
			expect.soft(inGap?.[3]).toBe(0);
			softPixel(played, await paintedColour(canvas, lit));
			softPixel(unplayed, await paintedColour(canvas, wave));
		});

		await test.step('a lit colour set on an ancestor repaints within two frames, as does a text colour, which the wave is mixed from', async () => {
			const { device } = await readWidth(canvas);

			await setOnBox(page, { '--sonic-lit': '#0080ff' });
			softPixel(await pixelAt(canvas, 1), [0, 128, 255, 255]);

			await setOnBox(page, { color: '#0080ff' });

			const unlit = await canvas.evaluate((element) =>
				getComputedStyle(element).getPropertyValue('--_sonic-unlit'),
			);

			softPixel(
				await pixelAt(canvas, (Math.floor(device / 2 / pitch) + 4) * pitch + 1),
				await paintedColour(canvas, `color-mix(in oklab, #0080ff 30%, ${unlit})`),
			);
		});
	},
);

test(
	'empty peaks draw a plain groove, set the empty state, and a ratio of 0 draws nothing',
	{ tag: '@mobile' },
	async ({ page }) => {
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
	},
);

test(
	'a groove size sets the empty groove in CSS pixels, whatever the ratio',
	{ tag: '@mobile' },
	async ({ page }) => {
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

		await expect
			.poll(async () => [await alphaAtRow(0.2), await alphaAtRow(0.35)])
			.toEqual([0, 255]);
	},
);

test('a long readout stays inside the strip at both ends, on one line and on glass of its own colour, and an empty string hides it', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, 'Touch shows the readout only once a drag reveals it');

	const { wavestrip } = await openWavestrip(page);
	const strip = await boxOf(wavestrip.locator('.sonic-wavestrip'));

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
	}));

	expect(look).toEqual({ fill: 'rgb(10, 20, 30)', isOneLine: true });

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
	const strip = await boxOf(wavestrip.locator('.sonic-wavestrip'));

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

test(
	'with fill, the strip takes its row and its ratios follow the height, while a marker size holds the markers still and sets their lanes',
	{ tag: '@mobile' },
	async ({ page }) => {
		await page.goto('/fixtures/');

		const strip = page.locator('#wavestrip-fill .sonic-wavestrip');
		const pointMarkers = page.locator('#wavestrip-fill .sonic-wavestrip-marker');

		await strip.scrollIntoViewIfNeeded();
		await expect(strip).toHaveCSS('block-size', '96px');
		await expect(strip).toHaveCSS('--_sonic-wavestrip-size', '96px');
		await expect(pointMarkers.first()).toHaveCSS('inline-size', '4px');

		// 6.7px apart: one lane for 4px markers, where the 96px strip's own 6.2px markers would take two
		const tops = await pointMarkers.evaluateAll((parts) =>
			parts.map((part) => getComputedStyle(part).top),
		);

		expect(tops).toEqual(['0px', '0px']);

		await page.locator('#wavestrip-fill-box').evaluate((box) => {
			box.style.setProperty('height', '48px');
		});
		await expect(strip).toHaveCSS('block-size', '48px');
		await expect(strip).toHaveCSS('--_sonic-wavestrip-size', '48px');
		await expect(pointMarkers.first()).toHaveCSS('inline-size', '4px');
	},
);

test('the hover readout opens over the pointer, and Escape dismisses it', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, 'Touch shows the readout only once a drag reveals it');

	const { canvas, wavestrip } = await openWavestrip(page);
	const box = await boxOf(canvas);

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
	const box = await boxOf(canvas);

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

async function pressBy(page: Page, marker: Locator, by: { x: number; y: number }): Promise<void> {
	const box = await boxOf(marker);

	await page.mouse.click(box.x + box.width / 2 + by.x, box.y + box.height / 2 + by.y);
}

function readValue(wavestrip: Locator): Promise<number> {
	return wavestrip.evaluate((element) => ('value' in element ? Number(element.value) : NaN));
}

test(
	'a press on a point marker snaps to it, in whichever lane it sits, and a press below one seeks to where it lands',
	{ tag: '@mobile' },
	async ({ page }) => {
		const { wavestrip } = await openWavestrip(page);
		const pointMarkers = wavestrip.locator('.sonic-wavestrip-marker');
		const [first, second] = await Promise.all([
			pointMarkers.nth(0).boundingBox(),
			pointMarkers.nth(1).boundingBox(),
		]);

		expect(second?.y).toBeGreaterThan((first?.y ?? 0) + (first?.height ?? 0));

		await pressBy(page, pointMarkers.nth(0), { x: -3, y: 0 });
		expect(await readValue(wavestrip)).toBe(60);

		await pressBy(page, pointMarkers.nth(1), { x: 3, y: 0 });
		expect(await readValue(wavestrip)).toBe(62);

		await pressBy(page, pointMarkers.nth(0), { x: -3, y: 20 });

		const value = await readValue(wavestrip);

		expect(value).toBeGreaterThan(55);
		expect(value).toBeLessThan(59);
	},
);

function startsAt(wavestrip: Locator, point: { x: number; y: number }): Promise<Array<number>> {
	return wavestrip.evaluate((element, { x, y }) => {
		const { markersFromPoint } = element as unknown as {
			markersFromPoint: (clientX: number, clientY: number) => Array<{ start: number }>;
		};

		return markersFromPoint.call(element, x, y).map(({ start }) => start);
	}, point);
}

test(
	"markersFromPoint at a point marker's center names it first, in whichever lane it sits, and a press there seeks to it",
	{ tag: '@mobile' },
	async ({ page }) => {
		const { wavestrip } = await openWavestrip(page);
		const pointMarkers = wavestrip.locator('.sonic-wavestrip-marker');

		for (const [index, starts] of [[60, 62], [62, 60], [240]].entries()) {
			const box = await boxOf(pointMarkers.nth(index));
			const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

			expect(await startsAt(wavestrip, center)).toEqual(starts);

			await page.mouse.click(center.x, center.y);
			expect(await readValue(wavestrip)).toBe(starts[0]);
		}

		const strip = await boxOf(wavestrip.locator('canvas'));

		expect(
			await startsAt(wavestrip, { x: strip.x + strip.width * 0.55, y: strip.y + strip.height / 2 }),
		).toEqual([150]);
		expect(await startsAt(wavestrip, { x: strip.x + strip.width * 0.55, y: strip.y - 2 })).toEqual(
			[],
		);
	},
);

async function hostDrawnMarker(
	page: Page,
): Promise<{ colour: string; drop: string; fill: string }> {
	const { wavestrip } = await openWavestrip(page);

	await wavestrip.evaluate((element) => {
		if (!(element instanceof HTMLElement)) return;

		element.style.setProperty('--sonic-marker-cue', 'rgb(10 20 30)');
		element.style.setProperty('--sonic-wavestrip-marker-edge', 'rgb(1 2 3)');
		element.style.setProperty('--sonic-wavestrip-marker-edge-width', '1px');
		Object.assign(element, {
			markers: [{ kind: 'cue', start: 100 }],
			renderMarker: (_marker: unknown, markerElement: HTMLElement) => {
				markerElement.textContent = '▲';
			},
		});
	});

	return wavestrip.locator('.sonic-wavestrip-marker').evaluate((markerElement) => {
		const style = getComputedStyle(markerElement);

		return { colour: style.color, drop: style.boxShadow, fill: style.backgroundColor };
	});
}

test("a marker the host draws paints no fill or edge of its own, and its text colour is the kind's", async ({
	page,
}) => {
	const drawn = await hostDrawnMarker(page);

	expect(drawn.fill).toMatch(clear);
	expect(drawn.drop).toMatch(clear);
	expect(drawn.colour).toBe('rgb(10, 20, 30)');
});

test('in forced colours a marker the host draws takes the system text colour', async ({
	browserName,
	page,
}) => {
	test.skip(browserName === 'webkit', noForcedColours);
	await page.emulateMedia({ forcedColors: 'active' });

	const drawn = await hostDrawnMarker(page);

	expect(drawn.fill).toMatch(clear);
	expect(drawn.drop).toMatch(clear);
	expect(drawn.colour).toBe(await systemColour(page, 'CanvasText'));
});
