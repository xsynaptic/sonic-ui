import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { canvasPixels, expectPixel, paintedColour, softPixel } from './canvas-probe.ts';

type Pixel = Awaited<ReturnType<typeof canvasPixels>>[number];

// The fixture pushes bin 300 of 1,024 at -6 dB over a -60 dB floor, at 44,100 Hz
const spikeHertz = (300 * 22_050) / 1024;

test.use({ deviceScaleFactor: 2 });

type Offset = undefined | { column?: number; row?: number };

interface Probe {
	alphaAt: (level: number, offset?: Offset) => Promise<number | undefined>;
	canvas: Locator;
	column: number;
	pixelAt: (level: number, offset?: Offset) => Promise<Pixel | undefined>;
	token: (name: string) => Promise<Pixel>;
}

async function openSpectrum(page: Page): Promise<Probe> {
	await page.goto('/fixtures/');

	const canvas = page.locator('#spectrum canvas');

	// Out of view it holds its frames, and on a phone the fixture sits below the fold
	await canvas.scrollIntoViewIfNeeded();
	// Until the first paint the canvas is still the default 300 by 150
	await expect
		.poll(async () => {
			const [floor] = await canvasPixels(canvas, [0], 0.9);

			return floor?.[3];
		})
		.toBe(255);

	const { height, width } = await canvas.evaluate((element) => {
		if (!(element instanceof HTMLCanvasElement)) throw new Error('Not a canvas');

		return { height: element.height, width: element.width };
	});
	const column = Math.floor((width * Math.log(spikeHertz / 20)) / Math.log(1000));
	const rowOf = (level: number): number => Math.round((-level / 90) * height);
	const pixelAt: Probe['pixelAt'] = async (level, offset = {}) => {
		const row = rowOf(level) + (offset.row ?? 0);
		const [pixel] = await canvasPixels(
			canvas,
			[column + (offset.column ?? 0)],
			(row + 0.5) / height,
		);

		return pixel;
	};

	const alphaAt: Probe['alphaAt'] = async (level, offset) => {
		const pixel = await pixelAt(level, offset);

		return pixel?.[3];
	};

	return {
		alphaAt,
		canvas,
		column,
		pixelAt,
		token: async (name) =>
			paintedColour(
				canvas,
				await canvas.evaluate(
					(element, property) => getComputedStyle(element).getPropertyValue(property),
					name,
				),
			),
	};
}

async function setOnBox(page: Page, property: string, value: string): Promise<void> {
	await page.evaluate(
		async ([name, next]) => {
			document.querySelector<HTMLElement>('#spectrum-box')?.style.setProperty(name, next);
			for (let frame = 0; frame < 2; frame += 1) {
				await new Promise((resolve) => requestAnimationFrame(resolve));
			}
		},
		[property, value] as const,
	);
}

test(
	'the spectrum paints its spike on the device grid, and repaints when a colour or the hot threshold changes',
	{ tag: '@mobile' },
	async ({ page }) => {
		const { alphaAt, canvas, pixelAt, token } = await openSpectrum(page);

		await test.step('the canvas backs every device pixel, the spike stands one column wide where the log axis puts it, and the bars turn from the lit colour to the hot one at the hot threshold', async () => {
			const { css, device } = await canvas.evaluate((element) => ({
				css: element.getBoundingClientRect().width,
				device: element instanceof HTMLCanvasElement ? element.width : 0,
			}));

			expect.soft(Math.abs(device - css * 2)).toBeLessThanOrEqual(1);
			expect.soft(await alphaAt(-6)).toBe(255);
			expect.soft(await alphaAt(-6, { row: -1 })).toBe(0);
			expect.soft(await alphaAt(-6, { column: -1 })).toBe(0);
			expect.soft(await alphaAt(-6, { column: 1 })).toBe(0);

			softPixel(await pixelAt(-30), await token('--_sonic-spectrum-lit'));
			softPixel(await pixelAt(-12, { row: 1 }), await token('--_sonic-spectrum-lit'));
			softPixel(await pixelAt(-12, { row: -1 }), await token('--_sonic-spectrum-hot'));
			expect
				.soft(await token('--_sonic-spectrum-hot'))
				.not.toEqual(await token('--_sonic-spectrum-lit'));
		});

		await test.step('a lit colour or a hot threshold set on an ancestor repaints within two frames', async () => {
			await setOnBox(page, '--sonic-lit', '#0080ff');
			softPixel(await pixelAt(-30), [0, 128, 255, 255]);

			await setOnBox(page, '--sonic-spectrum-hot-from', '-40');
			softPixel(await pixelAt(-30), await token('--_sonic-spectrum-hot'));
		});

		await test.step('the grid is a fifth of the text colour, and repaints within two frames when that changes', async () => {
			await setOnBox(page, 'color', '#00ffff');
			softPixel(await pixelAt(-24, { column: -20 }), [0, 255, 255, 51]);
		});
	},
);

test(
	'the grid follows a system text colour when the colour scheme flips',
	{ tag: '@mobile' },
	async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'light' });

		const { pixelAt } = await openSpectrum(page);

		await setOnBox(page, 'color-scheme', 'light dark');
		await setOnBox(page, 'color', 'CanvasText');
		expectPixel(await pixelAt(-24, { column: -20 }), [0, 0, 0, 51]);

		await page.emulateMedia({ colorScheme: 'dark' });

		// Read from the engine, since Firefox's dark CanvasText is not pure white
		const [red = 0, green = 0, blue = 0] = await page
			.locator('#spectrum-box')
			.evaluate((box) => (getComputedStyle(box).color.match(/[\d.]+/g) ?? []).map(Number));

		expect(red).toBeGreaterThan(200);
		await expect(async () => {
			expectPixel(await pixelAt(-24, { column: -20 }), [red, green, blue, 51]);
		}).toPass();
	},
);

test(
	'with fill, the spectrum takes its row and its size follows the height',
	{ tag: '@mobile' },
	async ({ page }) => {
		await page.goto('/fixtures/');

		const spectrum = page.locator('#spectrum-fill .sonic-spectrum');

		await spectrum.scrollIntoViewIfNeeded();
		await expect(spectrum).toHaveCSS('block-size', '128px');
		await expect(spectrum).toHaveCSS('--_sonic-spectrum-size', '128px');

		await page.locator('#spectrum-fill-box').evaluate((box) => {
			box.style.setProperty('height', '64px');
		});
		await expect(spectrum).toHaveCSS('block-size', '64px');
		await expect(spectrum).toHaveCSS('--_sonic-spectrum-size', '64px');
	},
);
