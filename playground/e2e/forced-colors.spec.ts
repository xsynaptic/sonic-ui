import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { canvasPixels, expectPixel, middleOf, paintedColour, pixelAt } from './canvas-probe.ts';
import { clear, systemColour } from './colour.ts';
import { mouseOnly, noForcedColours } from './pointer.ts';
import { stillTransitions } from './state.ts';

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
	'#route .sonic-toggle-well',
	'#route .sonic-toggle-cap',
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

const focusable = [
	'.sonic-dial',
	'.sonic-slider',
	'.sonic-wavestrip',
	'.sonic-waveform',
	'.sonic-number',
	'.sonic-button',
	'.sonic-segmented-option',
	'.sonic-switch-position',
	'.sonic-toggle-position',
	'.sonic-xy-axis',
];

test.skip(({ browserName }) => browserName === 'webkit', noForcedColours);

test.beforeEach(async ({ page }) => {
	await page.emulateMedia({ forcedColors: 'active' });
	await page.goto('/fixtures/');
});

test('a toggle draws its cap in CanvasText, and its well in Canvas until a lit position is chosen, a coloured one in its system colour', async ({
	page,
}) => {
	const backgroundOf = (part: string): Promise<string> =>
		page.locator(`#route ${part}`).evaluate((element) => getComputedStyle(element).backgroundColor);

	expect.soft(await backgroundOf('.sonic-toggle-cap')).toBe(await systemColour(page, 'CanvasText'));
	expect.soft(await backgroundOf('.sonic-toggle-well')).toBe(await systemColour(page, 'Canvas'));

	await page.getByRole('radio', { name: 'Dry' }).click();
	expect.soft(await backgroundOf('.sonic-toggle-well')).toBe(await systemColour(page, 'Highlight'));

	await page.getByRole('radio', { name: 'Wet' }).click();
	expect.soft(await backgroundOf('.sonic-toggle-well')).toBe(await systemColour(page, 'Mark'));
});

test('a hovered or latched cap keeps to system colours, and a disabled latched cap inks in the colour its grey fill is drawn against', async ({
	page,
}) => {
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

	const transparentDrop = expect.stringMatching(clear);

	expect({ dial, hovered, latched, option }).toEqual({
		dial: { colour: buttonFace, drop: transparentDrop, image: 'none' },
		hovered: { colour: buttonFace, drop: transparentDrop, image: 'none' },
		latched: { colour: highlight, drop: transparentDrop, image: 'none' },
		option: { colour: highlight, drop: transparentDrop, image: 'none' },
	});

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

test('a bare blank cap is edged by its rim alone', async ({ page }) => {
	await page.goto('/fixtures/no-skin/');

	const buttonText = await systemColour(page, 'ButtonText');
	const [, rim, edge] = await page
		.locator('#bare-blank .sonic-button-cap')
		.evaluate((cap) => getComputedStyle(cap).boxShadow.split(/,(?![^(]*\))/));

	expect(rim?.trim()).toContain(buttonText);
	expect(edge?.trim()).toMatch(clear);
});

test('drawn parts opt out of forced colours, and the indicator, the number box and a modulation tick keep to system colours', async ({
	page,
}) => {
	await test.step('every drawn part opts out of forced colours and paints, and every focusable element stays forced', async () => {
		const parts = await page.evaluate((selectors) => {
			return selectors.map((selector) => {
				const [element, pseudo] = selector.split('::', 2);
				const found = document.querySelector(element ?? '');
				if (!found) return { missing: true, selector };

				const style = getComputedStyle(found, pseudo === undefined ? undefined : `::${pseudo}`);

				return {
					adjust: style.forcedColorAdjust,
					isPainted:
						style.backgroundImage !== 'none' || style.backgroundColor !== 'rgba(0, 0, 0, 0)',
					selector,
				};
			});
		}, drawnParts);
		const adjusts = await page.evaluate(
			(selectors) =>
				selectors.map((selector) => {
					const found = document.querySelector(selector);

					return found ? getComputedStyle(found).forcedColorAdjust : 'missing';
				}),
			focusable,
		);

		expect
			.soft(parts)
			.toEqual(drawnParts.map((selector) => ({ adjust: 'none', isPainted: true, selector })));
		expect.soft(adjusts).toEqual(focusable.map(() => 'auto'));
	});

	await test.step('a slider’s indicator keeps to the ink whatever colour it is given', async () => {
		const colour = await page
			.locator('#edge-strip .sonic-slider-cap')
			.evaluate((cap) => getComputedStyle(cap, '::after').backgroundColor);

		expect.soft(colour).toBe(await systemColour(page, 'ButtonText'));
	});

	await test.step('the number box inks its digits, grey when disabled', async () => {
		const [canvasText, grayText] = [
			await systemColour(page, 'CanvasText'),
			await systemColour(page, 'GrayText'),
		];
		const read = (): Promise<string> =>
			page
				.locator('#tempo .sonic-number-value')
				.evaluate((digits) => getComputedStyle(digits).color);

		expect.soft(await read()).toBe(canvasText);

		await page.locator('#tempo').evaluate((host) => {
			host.setAttribute('disabled', '');
		});
		expect.soft(await read()).toBe(grayText);
	});

	await test.step('a live modulation paints its tick in CanvasText', async () => {
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

		expect.soft(dial.adjust).toBe('none');
		expect.soft(dial.paint).toContain(canvasText);
		expect.soft(slider.adjust).toBe('none');
		expect.soft(slider.paint).toContain(canvasText);
	});
});

function readLens(page: Page, selector: string): Promise<{ fill: string; rim: string }> {
	return page.locator(selector).evaluate((led) => {
		const style = getComputedStyle(led, '::after');

		return { fill: style.backgroundColor, rim: style.boxShadow };
	});
}

function readCrosshair(page: Page, id: string): Promise<{ lit: string; unlit: string }> {
	return page.locator(`#${id} .sonic-xy-field`).evaluate((lines) => {
		const style = getComputedStyle(lines, '::before');

		return { lit: style.backgroundImage, unlit: style.backgroundColor };
	});
}

function readPoint(page: Page, selector: string): Promise<{ fill: string; ring: string }> {
	return page.locator(selector).evaluate((element) => {
		const style = getComputedStyle(element);

		return { fill: style.backgroundColor, ring: style.borderTopColor };
	});
}

test('each part at rest paints in its system colours', async ({ page }) => {
	const [buttonText, canvasText, grayText, highlight, mark] = [
		await systemColour(page, 'ButtonText'),
		await systemColour(page, 'CanvasText'),
		await systemColour(page, 'GrayText'),
		await systemColour(page, 'Highlight'),
		await systemColour(page, 'Mark'),
	];

	await test.step('a scale prints in CanvasText and rules its ticks in ButtonText', async () => {
		const printed = await page.locator('#scaled .sonic-slider-scale').evaluate((scale) => ({
			label: getComputedStyle(scale.querySelector('.sonic-scale-label') ?? scale).color,
			tick: getComputedStyle(scale.querySelector('.sonic-scale-tick') ?? scale).backgroundColor,
		}));

		expect.soft(printed).toEqual({ label: canvasText, tick: buttonText });
	});

	await test.step('an endless dial lights its dot in Highlight', async () => {
		const ring = await paintOf(page, '#phase .sonic-dial-ring');

		expect.soft(ring.image).toContain('conic-gradient');
		expect.soft(ring.image).toContain(highlight);
	});

	await test.step('an LED lens is grey at rest, Highlight lit and Mark when ok, ringed in CanvasText', async () => {
		const [unlit, lit, ok] = [
			await readLens(page, '#led'),
			await readLens(page, '#led-lit'),
			await readLens(page, '#led-ok'),
		];
		const [danger, idle] = [await readLens(page, '#led-danger'), await readLens(page, '#led-idle')];

		expect.soft(unlit.fill).toBe(grayText);
		expect.soft(lit.fill).toBe(highlight);
		expect.soft(ok.fill).toBe(mark);
		expect.soft(danger.fill).toBe(mark);
		expect.soft(unlit.rim).toContain(canvasText);
		expect.soft(lit.rim).toContain(canvasText);

		expect.soft(idle.fill).toBe(grayText);
		expect.soft(idle.rim).toContain(highlight);
		expect.soft(idle.rim).not.toBe(unlit.rim);
	});

	await test.step('a ring paints its arc in system colours and leaves the button inside it forced', async () => {
		const arc = await page.locator('#ring-button').evaluate((ring) => {
			const style = getComputedStyle(ring, '::before');

			return { adjust: style.forcedColorAdjust, image: style.backgroundImage };
		});
		const button = await page
			.locator('#ring-button .sonic-button')
			.evaluate((element) => getComputedStyle(element).forcedColorAdjust);

		expect.soft(arc.adjust).toBe('none');
		expect.soft(arc.image).toContain(grayText);
		expect.soft(arc.image).toContain(highlight);
		expect.soft(button).toBe('auto');
	});

	await test.step('a switch draws its bat in CanvasText and a panel keeps its edge', async () => {
		const ball = await page
			.locator('#talk .sonic-switch-bat')
			.evaluate((element) => getComputedStyle(element, '::after').backgroundColor);
		const panel = await page
			.locator('#panel')
			.evaluate((element) => getComputedStyle(element).borderTopColor);

		expect.soft(ball).toBe(canvasText);
		expect.soft(panel).toBe(canvasText);
	});

	await test.step('an XY pad draws its crosshair lit in Highlight over GrayText, grey throughout when disabled', async () => {
		const [pad, locked] = [
			await readCrosshair(page, 'xy'),
			await readCrosshair(page, 'xy-disabled'),
		];

		expect.soft(pad.unlit).toBe(grayText);
		expect.soft(pad.lit).toContain(highlight);
		expect.soft(highlight).not.toBe(grayText);
		expect.soft(locked.lit).toContain(grayText);
		expect.soft(locked.lit).not.toContain(highlight);
	});

	// The graph opts out, so the answer is the same whether or not an engine forces an SVG stroke by itself
	await test.step('an envelope strokes its line in Highlight and drops its fill', async () => {
		const graph = await page.locator('#envelope .sonic-envelope-graph').evaluate((svg) => {
			const line = getComputedStyle(svg.querySelector('.sonic-envelope-line') ?? svg);
			const fill = getComputedStyle(svg.querySelector('.sonic-envelope-fill') ?? svg);

			return {
				adjust: getComputedStyle(svg).forcedColorAdjust,
				fill: fill.fill,
				stroke: line.stroke,
			};
		});

		expect.soft(graph).toEqual({ adjust: 'none', fill: 'none', stroke: highlight });
	});

	await test.step('a curve handle fills in CanvasText, and the puck is a CanvasText disc', async () => {
		expect
			.soft(
				await page
					.locator('#xy .sonic-xy-puck')
					.evaluate((element) => getComputedStyle(element, '::before').backgroundColor),
			)
			.toBe(canvasText);
		expect
			.soft(
				await readPoint(page, '#envelope-curves .sonic-envelope-curve[data-sonic-stage="decay"]'),
			)
			.toEqual({ fill: canvasText, ring: canvasText });
	});
});

test('a held or disabled point keeps a Canvas core under its ring, as does a held puck', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	await stillTransitions(page);

	const [canvas, grayText, highlight] = [
		await systemColour(page, 'Canvas'),
		await systemColour(page, 'GrayText'),
		await systemColour(page, 'Highlight'),
	];
	const points = [
		'#envelope .sonic-envelope-handle[data-sonic-stage="decay"]',
		'#envelope-curves .sonic-envelope-curve[data-sonic-stage="decay"]',
	];

	for (const selector of points) {
		await page.locator(selector).hover();
		await page.mouse.down();

		const held = await readPoint(page, selector);

		await page.mouse.up();
		expect.soft(held, selector).toEqual({ fill: canvas, ring: highlight });
	}

	const puck = page.locator('#xy .sonic-xy-puck');

	await puck.hover();
	await page.mouse.down();

	const heldPuck = await puck.evaluate(
		(element) => getComputedStyle(element, '::before').backgroundColor,
	);

	await page.mouse.up();
	expect.soft(heldPuck).toBe(canvas);

	for (const id of ['env-decay', 'env-sustain', 'env-decay-curve']) {
		await page.locator(`#${id}`).evaluate((dial) => {
			dial.setAttribute('disabled', '');
		});
	}

	for (const selector of points) {
		await expect(page.locator(selector)).toHaveAttribute('data-sonic-disabled', '');
		expect
			.soft(await readPoint(page, selector), selector)
			.toEqual({ fill: canvas, ring: grayText });
	}
});

test('a wavestrip plays in opaque Highlight, and a waveform and a spectrum paint in opaque CanvasText', async ({
	page,
}) => {
	const [highlight, canvasText] = [
		await systemColour(page, 'rgb(from Highlight r g b / 1)'),
		await systemColour(page, 'rgb(from CanvasText r g b / 1)'),
	];
	const wavestrip = page.locator('#wavestrip canvas');
	const waveform = page.locator('#waveform canvas');
	const spectrum = page.locator('#spectrum canvas');

	await wavestrip.scrollIntoViewIfNeeded();

	const played = await paintedColour(wavestrip, highlight);

	await expect(async () => {
		expectPixel(await pixelAt(wavestrip, 0), played);
	}).toPass();

	await waveform.scrollIntoViewIfNeeded();
	await page.locator('#waveform').evaluate((host: HTMLElementTagNameMap['sonic-waveform']) => {
		host.style.setProperty('--sonic-waveform-band-1', 'rgb(255 0 0)');
		host.style.setProperty('--sonic-waveform-edge-shade', '0.8');
		host.bands = { bandCount: 1, framesPerSecond: 10, levels: new Uint8Array(3000).fill(255) };
	});

	const wave = await paintedColour(waveform, canvasText);
	const middle = await middleOf(waveform);

	await expect(async () => {
		expectPixel(await pixelAt(waveform, middle), wave);
	}).toPass();

	await spectrum.scrollIntoViewIfNeeded();

	const bars = await paintedColour(spectrum, canvasText);

	await expect(async () => {
		const [pixel] = await canvasPixels(spectrum, [0], 0.9);

		expectPixel(pixel, bars);
	}).toPass();
});

test('each focusable element focused by a key paints its outline outside its box', async ({
	page,
}) => {
	for (const [name, selector] of [
		['a dial', '#level .sonic-dial'],
		['a slider', '#send .sonic-slider'],
		['a number box', '#tempo .sonic-number'],
		['a button', '#mute .sonic-button'],
		['a segmented option', '#mode .sonic-segmented-option[tabindex="0"]'],
		['a switch position', '#talk .sonic-switch-position[tabindex="0"]'],
		['a bare switch', '#sync .sonic-switch-position'],
		['a toggle position', '#route .sonic-toggle-position[tabindex="0"]'],
		['a toggle with no positions', '#link .sonic-toggle-position'],
		['a wavestrip', '#wavestrip .sonic-wavestrip'],
		['a waveform', '#waveform .sonic-waveform'],
		['an XY part', '#xy [data-sonic-axis="x"]'],
	] as const) {
		const control = page.locator(selector);

		await control.scrollIntoViewIfNeeded();
		await control.press('Shift');

		const outline = await control.evaluate((element) => {
			const style = getComputedStyle(element);

			return { colour: style.outlineColor, offset: style.outlineOffset, style: style.outlineStyle };
		});

		expect.soft(outline.colour, name).not.toMatch(clear);
		expect.soft(outline, name).toMatchObject({ offset: '2px', style: 'solid' });
	}

	// The XY part is still focused, and its outline is the pad's only focus ring
	const puckRing = await page
		.locator('#xy .sonic-xy-puck')
		.evaluate((puck) => getComputedStyle(puck, '::before').outlineStyle);

	expect.soft(puckRing).toBe('none');
});
