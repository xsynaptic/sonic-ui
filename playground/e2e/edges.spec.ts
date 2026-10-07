import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

async function openPinned(page: Page): Promise<{ host: Locator; strip: Locator }> {
	await page.goto('/fixtures/');

	const host = page.locator('#wavestrip-pinned');
	const strip = host.locator('.sonic-wavestrip');

	await strip.scrollIntoViewIfNeeded();
	await expect(strip).toHaveCSS('block-size', '96px');

	return { host, strip };
}

// Two dots 5.25px apart at any strip width: one lane at a 5px step, two at the 96px strip's own 5.5px
function laneTops(host: Locator, edgeWidth: string): Promise<Array<string>> {
	return host.evaluate((element: HTMLElementTagNameMap['sonic-wavestrip'], width) => {
		const canvas = element.querySelector('canvas');
		if (!canvas) throw new Error('The strip has no canvas');

		const secondsPerPx = element.max / canvas.getBoundingClientRect().width;

		element.style.setProperty('--sonic-wavestrip-marker-edge-width', width);
		element.markers = [{ start: 60 }, { start: 60 + 5.25 * secondsPerPx }];

		return [...element.querySelectorAll('.sonic-wavestrip-marker')].map(
			(dot) => getComputedStyle(dot).top,
		);
	}, edgeWidth);
}

test("the canvas is the strip's own box, its regions and readout keep their own edges, and forced colours edge a screen but not the strip in it", async ({
	page,
}) => {
	const { host, strip } = await openPinned(page);
	const readout = host.locator('.sonic-wavestrip-readout');

	await expect(strip).toHaveCSS('border-top-width', '0px');

	const boxes = await strip.evaluate((control) => {
		const canvas = control.querySelector('canvas');
		if (!canvas) throw new Error('The strip has no canvas');

		return [control, canvas].map((part) => {
			const { height, width, x, y } = part.getBoundingClientRect();

			return [x, y, width, height];
		});
	});

	expect(boxes[1]).toEqual(boxes[0]);
	await expect(host.locator('.sonic-wavestrip-region')).toHaveCSS(
		'border-inline-start-width',
		'1px',
	);
	await expect(readout).toHaveCSS('border-top-width', '2px');
	await expect(readout).toHaveCSS('border-top-color', 'rgb(1, 2, 3)');

	const screen = page.locator('#screen-strip');

	await screen.evaluate((glass) => {
		glass.style.setProperty('--sonic-glass-edge-width', '0');
	});
	await expect(screen).toHaveCSS('border-top-width', '0px');

	// Forced colours keep an edge on glass that asked for none
	await page.emulateMedia({ forcedColors: 'active' });
	await expect(screen).toHaveCSS('border-top-width', '1px');
	await expect(screen.locator('.sonic-wavestrip')).toHaveCSS('border-top-width', '0px');
	await expect(strip).toHaveCSS('border-top-width', '0px');
});

test('a marker edge width sets the lane step on a filled strip', async ({ page }) => {
	const { host } = await openPinned(page);

	expect(await laneTops(host, '1px')).toEqual(['0px', '0px']);
	await expect(host.locator('.sonic-wavestrip-marker').first()).toHaveCSS(
		'box-shadow',
		/0px 0px 0px 1px$/,
	);

	const ratio = await page.evaluate(() => devicePixelRatio);

	const [, lane = ''] = await laneTops(host, 'initial');

	expect(Number(lane.replace('px', ''))).toBeCloseTo(4 + Math.round(1.5 * ratio) / ratio, 3);
});
