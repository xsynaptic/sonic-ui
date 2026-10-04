import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { expectPixel, middleOf, paintedColour, pixelAt } from './canvas-probe.ts';

// A part paints at all only if it opts out; forced colours drop gradients and force backgrounds to Canvas
const drawnParts = [
	'#locked .sonic-dial-notches',
	'.sonic-dial-ring',
	'#locked .sonic-dial-modulation',
	'.sonic-dial-cap',
	'.sonic-dial-indicator::before',
	'.sonic-slider-groove',
	'#fader .sonic-slider-modulation',
	'.sonic-slider-cap',
	'#wavestrip .sonic-wavestrip-marker',
	'#waveform .sonic-waveform-playhead',
	'.sonic-button-cap',
	'.sonic-segmented-cap',
	'.sonic-meter-segments',
	'.sonic-meter-bar',
	'.sonic-meter-clip',
	'#ladder .sonic-meter-bar',
	'#scaled .sonic-scale-tick',
	'#talk .sonic-switch-bushing',
	'#talk .sonic-switch-bat::before',
	'#talk .sonic-switch-bat::after',
	'#xy .sonic-xy-field::before',
	'#xy .sonic-xy-field::after',
	'#xy .sonic-xy-puck::before',
	'#envelope .sonic-envelope-handle[data-sonic-stage="decay"]',
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

async function systemColour(page: Page, colour: string): Promise<string> {
	return page.evaluate((expression) => {
		const probe = document.createElement('div');

		probe.style.cssText = `forced-color-adjust: none; background: ${expression}`;
		document.body.append(probe);

		const computed = getComputedStyle(probe).backgroundColor;

		probe.remove();

		return computed;
	}, colour);
}

const focusable = [
	'.sonic-dial',
	'.sonic-slider',
	'.sonic-wavestrip',
	'.sonic-waveform',
	'.sonic-number',
	'.sonic-button',
	'.sonic-segmented-option',
	'.sonic-switch-position',
	'.sonic-xy-axis',
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

test('a hovered or latched cap keeps to system colours', async ({ page }) => {
	const [buttonFace, highlight] = [
		await systemColour(page, 'ButtonFace'),
		await systemColour(page, 'Highlight'),
	];
	const button = page.locator('#mute .sonic-button');

	await page.locator('#level .sonic-dial').hover();
	const dial = await paintOf(page, '#level .sonic-dial-cap');

	await button.hover();
	const hovered = await paintOf(page, '#mute .sonic-button-cap');

	await button.click();
	const latched = await paintOf(page, '#mute .sonic-button-cap');
	const option = await paintOf(page, '#mode [aria-checked="true"] .sonic-segmented-cap');

	const transparentDrop = expect.stringMatching(/^(rgba\(0, 0, 0, 0\)|transparent)/);

	expect({ dial, hovered, latched, option }).toEqual({
		dial: { colour: buttonFace, drop: transparentDrop, image: 'none' },
		hovered: { colour: buttonFace, drop: transparentDrop, image: 'none' },
		latched: { colour: highlight, drop: transparentDrop, image: 'none' },
		option: { colour: highlight, drop: transparentDrop, image: 'none' },
	});
});

test('a disabled latched cap inks in the colour its grey fill is drawn against', async ({
	page,
}) => {
	const buttonFace = await systemColour(page, 'ButtonFace');

	await page.locator('#mute .sonic-button').click();
	await page.evaluate(() => {
		for (const id of ['mute', 'mode'])
			document.querySelector(`#${id}`)?.setAttribute('disabled', '');
	});

	const inks = await page.evaluate(() =>
		['#mute .sonic-button-cap', '#mode [aria-checked="true"] .sonic-segmented-cap'].map(
			(selector) => {
				const cap = document.querySelector(selector);

				return cap ? getComputedStyle(cap).color : 'missing';
			},
		),
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

test('a scale prints in CanvasText and rules its ticks in ButtonText', async ({ page }) => {
	const [buttonText, canvasText] = [
		await systemColour(page, 'ButtonText'),
		await systemColour(page, 'CanvasText'),
	];
	const printed = await page.locator('#scaled .sonic-slider-scale').evaluate((scale) => ({
		label: getComputedStyle(scale.querySelector('.sonic-scale-label') ?? scale).color,
		tick: getComputedStyle(scale.querySelector('.sonic-scale-tick') ?? scale).backgroundColor,
	}));

	expect(printed).toEqual({ label: canvasText, tick: buttonText });
});

test('an endless dial lights its dot in Highlight', async ({ page }) => {
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
	const [clip, dim] = [await lens('#led-clip'), await lens('#led-dim')];

	expect(unlit.fill).toBe(grayText);
	expect(lit.fill).toBe(highlight);
	expect(alt.fill).toBe(mark);
	expect(clip.fill).toBe(mark);
	expect(unlit.rim).toContain(canvasText);
	expect(lit.rim).toContain(canvasText);

	expect(dim.fill).toBe(grayText);
	expect(dim.rim).toContain(highlight);
	expect(dim.rim).not.toBe(unlit.rim);
});

test('a live modulation paints its tick in CanvasText', async ({ page }) => {
	const canvasText = await systemColour(page, 'CanvasText');

	for (const id of ['modulated', 'modulated-slider']) {
		await page.locator(`#${id}`).evaluate((element) => {
			Object.assign(element, { modulationValue: 95 });
		});
	}

	const tick = (selector: string): Promise<{ adjust: string; paint: string }> =>
		page.locator(selector).evaluate((part) => {
			const style = getComputedStyle(part, '::after');

			return {
				adjust: style.forcedColorAdjust,
				paint: `${style.backgroundImage} ${style.backgroundColor}`,
			};
		});
	const [dial, slider] = [
		await tick('#modulated .sonic-dial-modulation'),
		await tick('#modulated-slider .sonic-slider-modulation'),
	];

	expect(dial.adjust).toBe('none');
	expect(dial.paint).toContain(canvasText);
	expect(slider.adjust).toBe('none');
	expect(slider.paint).toContain(canvasText);
});

test('a ring paints its arc in system colours and leaves the button inside it forced', async ({
	page,
}) => {
	const [grayText, highlight] = [
		await systemColour(page, 'GrayText'),
		await systemColour(page, 'Highlight'),
	];
	const arc = await page.locator('#ring-button').evaluate((ring) => {
		const style = getComputedStyle(ring, '::before');

		return { adjust: style.forcedColorAdjust, image: style.backgroundImage };
	});
	const button = await page
		.locator('#ring-button .sonic-button')
		.evaluate((element) => getComputedStyle(element).forcedColorAdjust);

	expect(arc.adjust).toBe('none');
	expect(arc.image).toContain(grayText);
	expect(arc.image).toContain(highlight);
	expect(button).toBe('auto');
});

test('a switch draws its bat in CanvasText and a panel keeps its edge', async ({ page }) => {
	const canvasText = await systemColour(page, 'CanvasText');
	const ball = await page
		.locator('#talk .sonic-switch-bat')
		.evaluate((element) => getComputedStyle(element, '::after').backgroundColor);
	const panel = await page
		.locator('#panel')
		.evaluate((element) => getComputedStyle(element).borderTopColor);

	expect(ball).toBe(canvasText);
	expect(panel).toBe(canvasText);
});

test('a wavestrip plays in opaque Highlight', async ({ page }) => {
	const canvas = page.locator('#wavestrip canvas');

	await canvas.scrollIntoViewIfNeeded();

	const opaque = await paintedColour(
		canvas,
		await systemColour(page, 'rgb(from Highlight r g b / 1)'),
	);

	await expect(async () => {
		expectPixel(await pixelAt(canvas, 0), opaque);
	}).toPass();
});

test('a waveform paints its wave in opaque CanvasText', async ({ page }) => {
	const canvas = page.locator('#waveform canvas');

	await canvas.scrollIntoViewIfNeeded();

	const opaque = await paintedColour(
		canvas,
		await systemColour(page, 'rgb(from CanvasText r g b / 1)'),
	);
	const middle = await middleOf(canvas);

	await expect(async () => {
		expectPixel(await pixelAt(canvas, middle), opaque);
	}).toPass();
});

test('an XY pad draws its crosshair lit in Highlight over GrayText, grey throughout when disabled', async ({
	page,
}) => {
	const [grayText, highlight] = [
		await systemColour(page, 'GrayText'),
		await systemColour(page, 'Highlight'),
	];
	const line = (id: string): Promise<{ lit: string; unlit: string }> =>
		page.locator(`#${id} .sonic-xy-field`).evaluate((lines) => {
			const style = getComputedStyle(lines, '::before');

			return { lit: style.backgroundImage, unlit: style.backgroundColor };
		});
	const [pad, locked] = [await line('xy'), await line('xy-disabled')];

	expect(pad.unlit).toBe(grayText);
	expect(pad.lit).toContain(highlight);
	expect(highlight).not.toBe(grayText);
	expect(locked.lit).toContain(grayText);
	expect(locked.lit).not.toContain(highlight);
});

for (const [name, selector] of [
	['a dial', '#level .sonic-dial'],
	['a slider', '#send .sonic-slider'],
	['a number box', '#tempo .sonic-number'],
	['a button', '#mute .sonic-button'],
	['a segmented option', '#mode .sonic-segmented-option[tabindex="0"]'],
	['a switch position', '#talk .sonic-switch-position[tabindex="0"]'],
	['a bare switch', '#sync .sonic-switch-position'],
	['a wavestrip', '#wavestrip .sonic-wavestrip'],
	['a waveform', '#waveform .sonic-waveform'],
	['an XY part', '#xy [data-sonic-axis="x"]'],
] as const) {
	test(`${name} focused by a key paints its outline outside its box`, async ({ page }) => {
		const control = page.locator(selector);

		await control.scrollIntoViewIfNeeded();
		await control.press('Shift');

		const outline = await control.evaluate((element) => {
			const style = getComputedStyle(element);

			return { colour: style.outlineColor, offset: style.outlineOffset, style: style.outlineStyle };
		});

		expect(outline.colour).not.toMatch(/^(rgba\(0, 0, 0, 0\)|transparent)$/);
		expect(outline).toMatchObject({ offset: '2px', style: 'solid' });
	});
}

// The graph opts out, so the answer is the same whether or not an engine forces an SVG stroke by itself
test('an envelope strokes its line in Highlight and drops its fill', async ({ page }) => {
	const highlight = await systemColour(page, 'Highlight');
	const graph = await page.locator('#envelope .sonic-envelope-graph').evaluate((svg) => {
		const line = getComputedStyle(svg.querySelector('.sonic-envelope-line') ?? svg);
		const fill = getComputedStyle(svg.querySelector('.sonic-envelope-fill') ?? svg);

		return {
			adjust: getComputedStyle(svg).forcedColorAdjust,
			fill: fill.fill,
			stroke: line.stroke,
		};
	});

	expect(graph).toEqual({ adjust: 'none', fill: 'none', stroke: highlight });
});

test('a curve handle fills in CanvasText, and the puck is a CanvasText star', async ({ page }) => {
	const text = await systemColour(page, 'CanvasText');
	const paintOfPoint = (selector: string) =>
		page.locator(selector).evaluate((element) => {
			const style = getComputedStyle(element);

			return { fill: style.backgroundColor, ring: style.borderTopColor };
		});

	expect(
		await page
			.locator('#xy .sonic-xy-puck')
			.evaluate((element) => getComputedStyle(element, '::before').backgroundColor),
	).toBe(text);
	expect(
		await paintOfPoint('#envelope-curves .sonic-envelope-curve[data-sonic-stage="decay"]'),
	).toEqual({ fill: text, ring: text });
});
