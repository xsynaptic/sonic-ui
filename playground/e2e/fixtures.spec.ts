import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { collectConsole } from './console-messages.ts';

test(
	'the fixtures have no axe violations, keep every scale mark inside its control, and load with a clean console',
	{ tag: '@mobile' },
	async ({ browserName, page }, testInfo) => {
		const messages = collectConsole(page);

		await page.goto('/fixtures/');
		await expect(page.getByRole('slider', { name: 'Level' })).toBeVisible();

		// Axe reads the same DOM in every engine
		if (browserName === 'chromium') {
			const results = await new AxeBuilder({ page })
				.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
				.analyze();

			await testInfo.attach('incomplete', {
				body: JSON.stringify(results.incomplete, undefined, '\t'),
				contentType: 'application/json',
			});
			expect.soft(results.violations).toEqual([]);
		}

		const outside = await page.evaluate(() =>
			[...document.querySelectorAll('.sonic-dial-scale > *, .sonic-slider-scale > *')].flatMap(
				(mark) => {
					const control = mark.parentElement?.parentElement;
					if (!control) return ['orphan'];

					const box = control.getBoundingClientRect();
					const own = mark.getBoundingClientRect();
					const overhang = Math.max(
						box.left - own.left,
						box.top - own.top,
						own.right - box.right,
						own.bottom - box.bottom,
					);

					// Subpixel glyph bounds round either way
					return overhang > 0.5
						? [`${mark.textContent || 'tick'} by ${overhang.toFixed(1)}px`]
						: [];
				},
			),
		);

		expect.soft(outside).toEqual([]);
		expect(messages).toEqual([]);
	},
);

// axe exempts custom-element hosts from `aria-prohibited-attr` and never checks that a name reaches the inner control
test('each control takes its name from the host', async ({ page }) => {
	await page.goto('/fixtures/');

	await expect(page.getByRole('slider', { name: 'Level' })).toBeVisible();
	await expect(page.getByRole('slider', { name: 'Send' })).toBeVisible();
	await expect(page.getByRole('spinbutton', { name: 'Tempo' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Mute' })).toBeVisible();
	await expect(page.getByRole('radiogroup', { name: 'Mode' })).toBeVisible();
	await expect(page.getByRole('radio', { checked: true, name: 'LP' })).toBeVisible();
});
