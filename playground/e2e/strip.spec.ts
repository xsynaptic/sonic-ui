import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { expectEdge, paintedLine, paintedRuns, softEdge, softRuns } from './paint-probe.ts';
import { boxOf, mouseOnly } from './pointer.ts';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
});

// 112px of travel with a 4.8px groove: 40, 60 and 80 of 100 sit 47.2px, 69.6px and 92px along the groove
test(
	'buffered regions paint along the groove between their values',
	{ tag: '@mobile' },
	async ({ page }) => {
		const progress = page.locator('#progress');

		await progress.evaluate((element) => {
			element.style.setProperty('--sonic-buffered', '#f0f');
			Object.assign(element, { value: 0 });
		});

		const line = await paintedLine(progress.locator('.sonic-slider-groove'), 'x');
		const runs = paintedRuns(
			line,
			([red, green, blue]) => Math.min(red, blue) > 150 && Math.min(red, blue) - green > 50,
		);

		expect(runs).toHaveLength(2);
		expectEdge(runs[0]?.[1], 47.2);
		expectEdge(runs[1]?.[0], 69.6);
		expectEdge(runs[1]?.[1], 92);
	},
);

test('a scrub slider thickens its groove under the pointer without changing its box, reads out there, and paints a drag from the played edge in the scrub colour', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const slider = page.locator('#seek .sonic-slider');
	const groove = slider.locator('.sonic-slider-groove');
	const countLayers = (): Promise<number> =>
		groove.evaluate(
			(element) => getComputedStyle(element).backgroundImage.split('linear-gradient').length,
		);

	await slider.scrollIntoViewIfNeeded();
	await expect(groove).toHaveCSS('block-size', '8px');

	const box = await boxOf(slider);

	const pointerX = box.x + (box.width * 3) / 4;
	const middle = box.y + box.height / 2;

	await page.mouse.move(pointerX, middle);
	await expect(groove).toHaveCSS('block-size', '16px');
	expect(await slider.boundingBox()).toEqual(box);

	const readout = slider.locator('.sonic-slider-readout');

	await expect(readout).toBeVisible();

	const bubble = await readout.boundingBox();

	expect(Math.abs((bubble?.x ?? 0) + (bubble?.width ?? 0) / 2 - pointerX)).toBeLessThanOrEqual(1.5);
	await expect(readout).toHaveText('225');

	await page.mouse.move(box.x + box.width / 2, middle);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 20, middle, { steps: 2 });

	const layers = await countLayers();

	await page.mouse.up();
	expect(layers - (await countLayers())).toBe(1);
});

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

async function readoutOffset(page: Page, id: string): Promise<{ above: number; across: number }> {
	return page.locator(`#${id}`).evaluate((element) => {
		const slider = element.querySelector('.sonic-slider')?.getBoundingClientRect();
		const cap = element.querySelector('.sonic-slider-cap')?.getBoundingClientRect();
		const readout = element.querySelector('.sonic-slider-readout')?.getBoundingClientRect();
		if (!slider || !cap || !readout) throw new Error('The slider did not render');

		return {
			above: slider.top - readout.bottom,
			across: readout.left + readout.width / 2 - (cap.left + cap.width / 2),
		};
	});
}

test.describe('a capless strip', () => {
	test.use({ reducedMotion: 'reduce' });

	// 24px of breadth, a 6px groove that thickens to 12px
	test(
		'a square-ended capless groove stops at the control’s box, and anchored to the end it thickens toward the start alone',
		{ tag: '@mobile' },
		async ({ page }) => {
			const slider = page.locator('#edge-strip .sonic-slider');

			expect(await grooveGaps(slider)).toEqual({ end: 0, left: 0, right: 0, start: 18 });

			await slider.focus();
			await page.keyboard.press('ArrowRight');
			await expect(slider.locator('.sonic-slider-groove')).toHaveCSS('block-size', '12px');
			expect(await grooveGaps(slider)).toEqual({ end: 0, left: 0, right: 0, start: 12 });
		},
	);

	// From 10 to 110, the value 35 and a region from 60 to 85 sit a quarter, a half and three quarters along
	// Taken of the groove as laid out, since a phone's width shortens the strip
	test(
		'a square-ended strip paints its indicator in its own colour, and its lit fill and buffered region to their proportions',
		{ tag: '@mobile' },
		async ({ page }) => {
			await test.step('the indicator takes its own colour', async () => {
				const colour = await page
					.locator('#edge-strip .sonic-slider-cap')
					.evaluate((cap) => getComputedStyle(cap, '::after').backgroundColor);

				expect.soft(colour).toBe('rgb(0, 255, 255)');
			});

			await test.step('with square ends, the lit fill and a buffered region stop at their proportions of the control’s length', async () => {
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

				softRuns(runs, [
					[0, line.lengthPx * 0.25],
					[line.lengthPx * 0.5, line.lengthPx * 0.75],
				]);

				await strip.evaluate((element) => {
					Object.assign(element, { value: 10 });
				});

				const atMin = paintedRuns(
					await paintedLine(strip.locator('.sonic-slider-groove'), 'x'),
					([red, green, blue]) => Math.min(red, blue) > 150 && Math.min(red, blue) - green > 50,
				);

				expect.soft(atMin).toHaveLength(1);
				softEdge(atMin[0]?.[0], line.lengthPx * 0.5);
			});
		},
	);
});

test.describe('a long slider', () => {
	test.use({ reducedMotion: 'reduce' });

	test(
		'a length of 100% fills the parent, and a capless slider shows its focus on the groove and keeps its readout over the cap to the far end',
		{ tag: '@mobile' },
		async ({ page }) => {
			const strip = page.locator('#strip');
			const control = strip.getByRole('slider');
			const groove = strip.locator('.sonic-slider-groove');
			const resting = await groove.evaluate((element) => getComputedStyle(element).boxShadow);

			await control.focus();
			await page.keyboard.press('PageUp');
			await expect(groove).not.toHaveCSS('box-shadow', resting);
			await expect(strip.locator('.sonic-slider-readout')).toBeVisible();

			const low = await readoutOffset(page, 'strip');

			expect(Math.abs(low.across)).toBeLessThan(1);

			await page.keyboard.press('End');

			const gaps = await strip.evaluate((element) => {
				const parent = element.parentElement?.getBoundingClientRect();
				const slider = element.querySelector('.sonic-slider')?.getBoundingClientRect();
				const cap = element.querySelector('.sonic-slider-cap')?.getBoundingClientRect();
				if (!parent || !slider || !cap) throw new Error('The slider did not render');

				return { end: slider.right - cap.right, width: parent.width - slider.width };
			});

			expect(Math.abs(gaps.width)).toBeLessThan(0.5);
			expect(Math.abs(gaps.end)).toBeLessThan(0.5);

			await page.keyboard.press('PageDown');
			await expect(control).toHaveAttribute('aria-valuenow', '250');

			const high = await readoutOffset(page, 'strip');

			expect(Math.abs(high.across)).toBeLessThan(1);
		},
	);

	test(
		'a vertical fader keeps its readout centerd above its top end',
		{ tag: '@mobile' },
		async ({ page }) => {
			const fader = page.locator('#fader');

			await fader.evaluate((element) => {
				element.toggleAttribute('readout', true);
			});
			await fader.getByRole('slider').focus();
			await page.keyboard.press('ArrowUp');
			await expect(fader.locator('.sonic-slider-readout')).toBeVisible();

			const offset = await readoutOffset(page, 'fader');

			expect(offset.above).toBeGreaterThanOrEqual(0);
			expect(Math.abs(offset.across)).toBeLessThan(1);
		},
	);
});
