import { expect, test } from '@playwright/test';

import { expectEdge, paintedLine, paintedRuns } from './paint-probe.ts';

// 112px of travel with a 4.8px groove: 40, 60 and 80 of 100 sit 47.2px, 69.6px and 92px along the groove
test('buffered regions paint along the groove between their values', async ({ page }) => {
	await page.goto('/fixtures/');

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
});
