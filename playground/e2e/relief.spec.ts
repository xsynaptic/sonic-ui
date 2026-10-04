import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { collectConsole } from './console-messages.ts';

interface Face {
	gradient: string;
	shadowAlphas: Array<number>;
}

const faces = [
	{ name: 'a button', pseudo: '::before', selector: '#kick .sonic-button-cap' },
	{ name: 'a dial', pseudo: '::after', selector: '#level .sonic-dial-cap' },
];

function readFace(page: Page, selector: string, pseudo: string): Promise<Face> {
	return page.locator(selector).evaluate((element, pseudoElement) => {
		const styles = getComputedStyle(element, pseudoElement);
		const colours = styles.boxShadow.match(/[a-z]+\([^)]*\)/g) ?? [];

		return {
			gradient: styles.backgroundImage,
			shadowAlphas: colours.map((colour) => {
				const parts = colour.slice(colour.indexOf('(') + 1, -1).split(/[,/]/);

				return colour.includes('/') || parts.length === 4 ? Number(parts.at(-1)) : 1;
			}),
		};
	}, pseudo);
}

for (const { name, pseudo, selector } of faces) {
	test(`the flat skin leaves no shading on the face of ${name}`, async ({ page }) => {
		const messages = collectConsole(page);

		await page.goto('/fixtures/');

		const lit = await readFace(page, selector, pseudo);

		expect(lit.gradient).toContain('gradient');
		expect(lit.shadowAlphas.length).toBeGreaterThan(0);
		for (const alpha of lit.shadowAlphas) expect(alpha).toBeGreaterThan(0);

		await page.evaluate(() => {
			document.documentElement.classList.add('sonic-skin-flat');
		});

		const flat = await readFace(page, selector, pseudo);

		expect(flat.gradient).toContain('gradient');
		expect(flat.shadowAlphas).toEqual(lit.shadowAlphas.map(() => 0));
		expect(messages).toEqual([]);
	});
}
