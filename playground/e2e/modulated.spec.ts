import type { Locator } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { readState } from './state.ts';

function setModulated(host: Locator, value: number | undefined): Promise<void> {
	return host.evaluate((element, modulationValue) => {
		Object.assign(element, { modulationValue });
	}, value);
}

// A pseudo-element has no box to measure, only computed lengths
function px(length: string): number {
	return Number(length.replace('px', ''));
}

for (const [id, part] of [
	['modulated', '.sonic-dial-modulation'],
	['modulated-slider', '.sonic-slider-modulation'],
] as const) {
	test(`#${id} renders its modulation part with a live value alone, and drops it when cleared`, async ({
		page,
	}) => {
		await page.goto('/fixtures/');

		const host = page.locator(`#${id}`);
		const drawn = host.locator(part);

		await expect(drawn).toHaveCSS('display', 'none');

		await setModulated(host, 95);
		await expect(drawn).toHaveCSS('display', 'block');
		expect(await readState(host, 'modulated')).toBe(true);

		await setModulated(host, undefined);
		await expect(drawn).toHaveCSS('display', 'none');
	});
}

test('a slider draws the live value from the cap to the modulation value, with a tick there', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const host = page.locator('#modulated-slider');

	await setModulated(host, 95);

	const boxes = await host.locator('.sonic-slider').evaluate((slider) => {
		const part = slider.querySelector('.sonic-slider-modulation');
		const cap = slider.querySelector('.sonic-slider-cap');
		if (!part || !cap) throw new Error('The slider has no parts');

		const groove = slider.getBoundingClientRect();
		const live = getComputedStyle(part, '::before');
		const tick = getComputedStyle(part, '::after');

		return {
			capWidth: cap.getBoundingClientRect().width,
			grooveWidth: groove.width,
			liveLength: live.inlineSize,
			partLeft: part.getBoundingClientRect().left - groove.left,
			tickLeft: tick.left,
			tickWidth: tick.inlineSize,
		};
	});
	const travel = boxes.grooveWidth - boxes.capWidth;

	expect(boxes.partLeft).toBeCloseTo(boxes.capWidth / 2 + 0.2 * travel, 0);
	expect(px(boxes.liveLength)).toBeCloseTo(0.55 * travel, 0);
	expect(px(boxes.tickLeft) + px(boxes.tickWidth) / 2).toBeCloseTo(0.55 * travel, 0);
});
