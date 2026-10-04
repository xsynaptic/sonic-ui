import { expect, test } from '@playwright/test';

for (const path of ['/', '/club-mixer/', '/fixtures/']) {
	test(`every scale mark on ${path} lies inside its control`, async ({ page }) => {
		await page.goto(path);

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

		expect(outside).toEqual([]);
	});
}

test('a labelled selector stays a slider that names its stop', async ({ page }) => {
	await page.goto('/fixtures/');

	const selector = page.getByRole('slider', { name: 'Echo mode' });

	await selector.press('ArrowRight');

	await expect(selector).toHaveAttribute('aria-valuetext', 'Ping-pong');
});
