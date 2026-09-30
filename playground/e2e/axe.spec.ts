import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = ['/', '/club-mixer/', '/tape-echo/', '/web-player/', '/fixtures/'];

for (const path of pages) {
	test(`${path} has no axe violations`, async ({ page }, testInfo) => {
		await page.goto(path);

		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
			.analyze();

		await testInfo.attach('incomplete', {
			body: JSON.stringify(results.incomplete, undefined, '\t'),
			contentType: 'application/json',
		});
		expect(results.violations).toEqual([]);
	});
}
