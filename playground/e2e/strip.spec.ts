import type { Locator } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { expectEdge, paintedLine, paintedRuns } from './paint-probe.ts';

test.use({ reducedMotion: 'reduce' });

interface Gaps {
	end: number;
	left: number;
	right: number;
	start: number;
}

function grooveGaps(slider: Locator): Promise<Gaps> {
	return slider.evaluate((element) => {
		const box = element.getBoundingClientRect();
		const groove = element.querySelector('.sonic-slider-groove')?.getBoundingClientRect();
		if (!groove) throw new Error('The slider has no groove');

		return {
			end: box.bottom - groove.bottom,
			left: groove.left - box.left,
			right: box.right - groove.right,
			start: groove.top - box.top,
		};
	});
}

// 24px of breadth, a 6px groove that thickens to 12px
test('a square-ended capless groove stops at the control’s box, and anchored to the end it thickens toward the start alone', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const slider = page.locator('#edge-strip .sonic-slider');

	expect(await grooveGaps(slider)).toEqual({ end: 0, left: 0, right: 0, start: 18 });

	await slider.focus();
	await page.keyboard.press('ArrowRight');
	await expect(slider.locator('.sonic-slider-groove')).toHaveCSS('block-size', '12px');
	expect(await grooveGaps(slider)).toEqual({ end: 0, left: 0, right: 0, start: 12 });
});

// 288px of travel from 10 to 110: 35, 60 and 85 sit 72px, 144px and 216px along the groove
test('with square ends, the lit fill and a buffered region stop at their proportions of the control’s length', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const strip = page.locator('#edge-strip');

	await strip.evaluate((element) => {
		element.style.setProperty('--sonic-lit', '#f0f');
		element.style.setProperty('--sonic-buffered', '#f0f');
	});

	const line = await paintedLine(strip.locator('.sonic-slider-groove'), 'x');
	const runs = paintedRuns(
		line,
		([red, green, blue]) => Math.min(red, blue) > 150 && Math.min(red, blue) - green > 50,
	);

	expect(runs).toHaveLength(2);
	expectEdge(runs[0]?.[0], 0);
	expectEdge(runs[0]?.[1], 72);
	expectEdge(runs[1]?.[0], 144);
	expectEdge(runs[1]?.[1], 216);

	await strip.evaluate((element) => {
		Object.assign(element, { value: 10 });
	});

	const atMin = paintedRuns(
		await paintedLine(strip.locator('.sonic-slider-groove'), 'x'),
		([red, green, blue]) => Math.min(red, blue) > 150 && Math.min(red, blue) - green > 50,
	);

	expect(atMin).toHaveLength(1);
	expectEdge(atMin[0]?.[0], 144);
});

test('the indicator takes its own colour', async ({ page }) => {
	await page.goto('/fixtures/');

	const colour = await page
		.locator('#edge-strip .sonic-slider-cap')
		.evaluate((cap) => getComputedStyle(cap, '::after').backgroundColor);

	expect(colour).toBe('rgb(0, 255, 255)');
});
