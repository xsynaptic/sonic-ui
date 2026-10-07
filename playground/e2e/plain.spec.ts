import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

const plain = [
	'#wavestrip .sonic-wavestrip',
	'#waveform .sonic-waveform',
	'#spectrum .sonic-spectrum',
	'#xy .sonic-xy',
	'#envelope .sonic-envelope',
];

function readColour(page: Page, selector: string, property: string): Promise<string> {
	return page
		.locator(selector)
		.first()
		.evaluate((part, name) => getComputedStyle(part).getPropertyValue(name), property);
}

test('under a skin with relief a plain control draws no glass: no fill, no edge, no corner and no overlay', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	for (const selector of plain) {
		const look = await page.locator(selector).evaluate((control) => {
			const style = getComputedStyle(control);

			return {
				corner: style.borderTopLeftRadius,
				edge: style.borderTopWidth,
				fill: `${style.backgroundColor} ${style.backgroundImage}`,
				overlay: getComputedStyle(control, '::after').content,
				texture: getComputedStyle(control, '::before').content,
			};
		});

		expect(look, selector).toEqual({
			corner: '0px',
			edge: '0px',
			fill: 'rgba(0, 0, 0, 0) none',
			overlay: 'none',
			texture: 'none',
		});
	}
});

test('a marker takes the text colour, whatever glass an ancestor asks for', async ({ page }) => {
	await page.goto('/fixtures/');
	await page.locator('#wavestrip-box').evaluate((box) => {
		box.style.setProperty('--sonic-glass', 'transparent');
		box.style.setProperty('color', 'rgb(40 90 160)');
	});

	expect(await readColour(page, '#wavestrip .sonic-wavestrip-marker', 'background-color')).toBe(
		'rgb(40, 90, 160)',
	);
});

test("on a screen a marker takes the glass's text colour and not the skin's ink, and a region is as tall as the strip", async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const glassText = await readColour(page, '#screen-ivory', 'color');
	const pageText = await readColour(page, 'body', 'color');

	expect(glassText).not.toBe(pageText);
	expect(
		await readColour(page, '#wavestrip-ivory .sonic-wavestrip-marker', 'background-color'),
	).toBe(glassText);

	const heights = await page
		.locator('#screen-ivory')
		.evaluate((screen) =>
			[screen, ...screen.querySelectorAll('.sonic-wavestrip, .sonic-wavestrip-region')].map(
				(part) => part.getBoundingClientRect().height,
			),
		);

	expect(heights).toEqual([64, 56, 56]);
});
