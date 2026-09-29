import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

// A part paints at all only if it opts out; forced colours drop gradients and force backgrounds to Canvas
const drawnParts = [
	'#locked .sonic-dial-notches',
	'.sonic-dial-ring',
	'#locked .sonic-dial-modulation',
	'.sonic-dial-cap',
	'.sonic-dial-pointer::before',
	'.sonic-slider-groove',
	'#fader .sonic-slider-modulation',
	'.sonic-slider-cap',
	'.sonic-key-cap',
	'#loading .sonic-key::after',
	'.sonic-segmented-cap',
	'.sonic-meter-segments',
	'.sonic-meter-level',
	'.sonic-meter-clip',
	'#ladder .sonic-meter-level',
	'#legend .sonic-scale-tick',
];

async function paintOf(
	page: Page,
	selector: string,
): Promise<{ colour: string; drop: string; image: string }> {
	return page.locator(selector).evaluate((cap) => {
		const style = getComputedStyle(cap);

		return {
			colour: style.backgroundColor,
			drop: style.boxShadow.split(/,(?![^(]*\))/, 1)[0]?.trim() ?? '',
			image: style.backgroundImage,
		};
	});
}

async function systemColour(page: Page, keyword: string): Promise<string> {
	return page.evaluate((colour) => {
		const probe = document.createElement('div');

		probe.style.cssText = `forced-color-adjust: none; background: ${colour}`;
		document.body.append(probe);

		const computed = getComputedStyle(probe).backgroundColor;

		probe.remove();

		return computed;
	}, keyword);
}

const focusable = [
	'.sonic-dial',
	'.sonic-slider',
	'.sonic-number',
	'.sonic-key',
	'.sonic-segmented-segment',
];

test.skip(({ browserName }) => browserName === 'webkit', 'WebKit has no forced-colours mode');

test.beforeEach(async ({ page }) => {
	await page.emulateMedia({ forcedColors: 'active' });
	await page.goto('/fixtures/');
});

test('every drawn part opts out of forced colours and paints', async ({ page }) => {
	const parts = await page.evaluate((selectors) => {
		return selectors.map((selector) => {
			const [element, pseudo] = selector.split('::', 2);
			const found = document.querySelector(element ?? '');
			if (!found) return { missing: true, selector };

			const style = getComputedStyle(found, pseudo === undefined ? undefined : `::${pseudo}`);

			return {
				adjust: style.forcedColorAdjust,
				isPainted: style.backgroundImage !== 'none' || style.backgroundColor !== 'rgba(0, 0, 0, 0)',
				selector,
			};
		});
	}, drawnParts);

	expect(parts).toEqual(
		drawnParts.map((selector) => ({ adjust: 'none', isPainted: true, selector })),
	);
});

// Opted out, the transparent focus outline would stay transparent
test('every focusable element stays forced', async ({ page }) => {
	const adjusts = await page.evaluate(
		(selectors) =>
			selectors.map((selector) => {
				const found = document.querySelector(selector);

				return found ? getComputedStyle(found).forcedColorAdjust : 'missing';
			}),
		focusable,
	);

	expect(adjusts).toEqual(focusable.map(() => 'auto'));
});

// A state rule that paints a cap directly would bring its gradient or drop back
test('a hovered or latched cap keeps to system colours', async ({ page }) => {
	const [buttonFace, highlight] = [
		await systemColour(page, 'ButtonFace'),
		await systemColour(page, 'Highlight'),
	];
	const key = page.locator('#mute .sonic-key');

	await page.locator('#level .sonic-dial').hover();
	const dial = await paintOf(page, '#level .sonic-dial-cap');

	await key.hover();
	const hovered = await paintOf(page, '#mute .sonic-key-cap');

	await key.click();
	const latched = await paintOf(page, '#mute .sonic-key-cap');
	const segment = await paintOf(page, '#mode [aria-checked="true"] .sonic-segmented-cap');

	const transparentDrop = expect.stringMatching(/^(rgba\(0, 0, 0, 0\)|transparent)/);

	expect({ dial, hovered, latched, segment }).toEqual({
		dial: { colour: buttonFace, drop: transparentDrop, image: 'none' },
		hovered: { colour: buttonFace, drop: transparentDrop, image: 'none' },
		latched: { colour: highlight, drop: transparentDrop, image: 'none' },
		segment: { colour: highlight, drop: transparentDrop, image: 'none' },
	});
});

test('a disabled latched cap inks in the colour its grey fill is drawn against', async ({
	page,
}) => {
	const buttonFace = await systemColour(page, 'ButtonFace');

	await page.locator('#mute .sonic-key').click();
	await page.evaluate(() => {
		for (const id of ['mute', 'mode'])
			document.querySelector(`#${id}`)?.setAttribute('disabled', '');
	});

	const inks = await page.evaluate(() =>
		['#mute .sonic-key-cap', '#mode [aria-checked="true"] .sonic-segmented-cap'].map((selector) => {
			const cap = document.querySelector(selector);

			return cap ? getComputedStyle(cap).color : 'missing';
		}),
	);

	expect(inks).toEqual([buttonFace, buttonFace]);
});

test('the number box edges its glass and inks its digits, grey when disabled', async ({ page }) => {
	const [canvasText, grayText] = [
		await systemColour(page, 'CanvasText'),
		await systemColour(page, 'GrayText'),
	];
	const read = (): Promise<{ border: string; digits: string }> =>
		page.locator('#tempo .sonic-number').evaluate((control) => ({
			border: getComputedStyle(control).borderTopColor,
			digits: getComputedStyle(control.querySelector('.sonic-number-value') ?? control).color,
		}));

	expect(await read()).toEqual({ border: canvasText, digits: canvasText });

	await page.locator('#tempo').evaluate((host) => {
		host.setAttribute('disabled', '');
	});
	expect(await read()).toEqual({ border: canvasText, digits: grayText });
});

test('a legend prints in CanvasText and rules its ticks in ButtonText', async ({ page }) => {
	const [buttonText, canvasText] = [
		await systemColour(page, 'ButtonText'),
		await systemColour(page, 'CanvasText'),
	];
	const legend = await page.locator('#legend .sonic-slider-scale').evaluate((scale) => ({
		label: getComputedStyle(scale.querySelector('.sonic-scale-label') ?? scale).color,
		tick: getComputedStyle(scale.querySelector('.sonic-scale-tick') ?? scale).backgroundColor,
	}));

	expect(legend).toEqual({ label: canvasText, tick: buttonText });
});

test('an endless dial lights its segment in Highlight', async ({ page }) => {
	const highlight = await systemColour(page, 'Highlight');
	const ring = await paintOf(page, '#phase .sonic-dial-ring');

	expect(ring.image).toContain('conic-gradient');
	expect(ring.image).toContain(highlight);
});

test('an LED lens is grey at rest, Highlight lit and Mark in its second colour, ringed in CanvasText', async ({
	page,
}) => {
	const [canvasText, grayText, highlight, mark] = [
		await systemColour(page, 'CanvasText'),
		await systemColour(page, 'GrayText'),
		await systemColour(page, 'Highlight'),
		await systemColour(page, 'Mark'),
	];
	const lens = (selector: string): Promise<{ fill: string; rim: string }> =>
		page.locator(selector).evaluate((led) => {
			const style = getComputedStyle(led, '::after');

			return { fill: style.backgroundColor, rim: style.boxShadow };
		});

	const [unlit, lit, alt] = [await lens('#led'), await lens('#led-lit'), await lens('#led-alt')];

	expect(unlit.fill).toBe(grayText);
	expect(lit.fill).toBe(highlight);
	expect(alt.fill).toBe(mark);
	expect(unlit.rim).toContain(canvasText);
});
