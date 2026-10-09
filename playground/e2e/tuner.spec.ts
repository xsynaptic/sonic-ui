import { expect, test } from '@playwright/test';

import { resolvedProperty, tokenGroups } from '../src/scripts/specimens/tuner-tokens.ts';

test.skip(({ browserName }) => browserName !== 'chromium', 'The tuner is the playground’s own');

test('every tuner baseline resolves on its part', async ({ page }) => {
	await page.goto('/');

	const rows = tokenGroups.flatMap((group) =>
		group.tokens
			.filter((token) => token.kind !== 'choice')
			.map((token) => ({
				from: token.from ?? group.from,
				property: resolvedProperty(token),
				token: token.token,
			})),
	);
	const unresolved = await page.locator('[data-tuner-panel]').evaluate(
		(panel, list) =>
			list
				.filter(({ from, property }) => {
					const part = panel.querySelector(from);

					return !part || getComputedStyle(part).getPropertyValue(property).trim() === '';
				})
				.map(({ token }) => token),
		rows,
	);

	expect(unresolved).toEqual([]);
});
