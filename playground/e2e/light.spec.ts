import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

const tilt = 60;

const shaded = [
	'#level .sonic-dial-cap',
	'#kick .sonic-button',
	'#kick .sonic-button-cap',
	'#mute .sonic-button',
	'#send .sonic-slider-cap',
	'#mode .sonic-segmented-cap',
	'#talk .sonic-switch-bat::before',
	'#ladder .sonic-meter-segments::after',
];

const cast = [
	'#level .sonic-dial-cap',
	'#kick .sonic-button',
	'#kick .sonic-button-cap',
	'#send .sonic-slider-cap',
	'#send .sonic-slider-groove',
	'#mode .sonic-segmented-cap',
	'#talk .sonic-switch-bushing',
	'#panel',
];

function readStyles(
	page: Page,
	selectors: Array<string>,
	property: 'backgroundImage' | 'boxShadow',
): Promise<Array<string>> {
	return page.evaluate(
		([selectors, property]) =>
			selectors.map((selector) => {
				const [element = '', pseudo] = selector.split('::', 2);
				const found = document.querySelector(element);
				if (!found) throw new Error(`Nothing matches ${selector}`);

				return getComputedStyle(found, pseudo === undefined ? undefined : `::${pseudo}`)[property];
			}),
		[selectors, property] as const,
	);
}

async function readGradients(page: Page): Promise<Array<number>> {
	const images = await readStyles(page, shaded, 'backgroundImage');

	return images.map((image) => {
		const angle = /linear-gradient\((?:calc\()?(-?[\d.]+)deg/.exec(image);

		return angle ? Math.round(Number(angle[1])) : NaN;
	});
}

// A cast shadow falls away from the light, so its offset turns from straight down by the tilt
async function readFalls(page: Page): Promise<Array<number>> {
	const shadows = await readStyles(page, cast, 'boxShadow');

	return shadows
		.flatMap((shadow) => shadow.split(/,(?![^(]*\))/))
		.flatMap((shadow) => {
			const [x = 0, y = 0] = [...shadow.matchAll(/(-?\d*\.?\d+(?:e-?\d+)?)px/g)].map((offset) =>
				Number(offset[1]),
			);
			if (x === 0 && y === 0) return [];

			return [Math.round(((Math.atan2(x, y) * 180) / Math.PI + 360) % 180)];
		});
}

test('every directional gradient and cast shadow turns with the one light', async ({ page }) => {
	await page.goto('/fixtures/');
	await page.locator('#mute .sonic-button').click();

	const falls = await readFalls(page);

	expect(await readGradients(page)).toEqual(shaded.map(() => 163));
	expect(falls.length).toBeGreaterThanOrEqual(cast.length);
	expect(new Set(falls)).toEqual(new Set([17]));

	await page.addStyleTag({ content: `:root { --sonic-light-tilt: ${String(tilt)}deg; }` });

	await expect(async () => {
		expect(await readGradients(page)).toEqual(shaded.map(() => 180 - tilt));
		expect(await readFalls(page)).toEqual(falls.map(() => tilt));
	}).toPass();
});
