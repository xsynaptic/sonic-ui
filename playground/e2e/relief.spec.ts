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

test("the flat skin leaves no shading on the face of a button or a dial, and inks a button's icon evenly where the default fades it along the light", async ({
	page,
}) => {
	const messages = collectConsole(page);

	await page.goto('/fixtures/');

	const icon = page.locator('#next .sonic-button-cap > svg');
	const readMask = (): Promise<string> =>
		icon.evaluate((element) => getComputedStyle(element).maskImage);
	const readFaces = (): Promise<Array<Face>> =>
		Promise.all(faces.map(({ pseudo, selector }) => readFace(page, selector, pseudo)));
	const lit = await readFaces();

	for (const [index, face] of lit.entries()) {
		const name = faces[index]?.name;

		expect(face.gradient, name).toContain('gradient');
		expect(face.shadowAlphas.length, name).toBeGreaterThan(0);
		for (const alpha of face.shadowAlphas) expect(alpha, name).toBeGreaterThan(0);
	}
	expect(await readMask()).toContain('rgba(0, 0, 0, 0.6)');

	await page.evaluate(() => {
		document.documentElement.classList.add('sonic-skin-flat');
	});

	const flat = await readFaces();

	for (const [index, face] of flat.entries()) {
		const name = faces[index]?.name;

		expect(face.gradient, name).toContain('gradient');
		expect(face.shadowAlphas, name).toEqual(lit[index]?.shadowAlphas.map(() => 0));
	}
	expect(await readMask()).not.toContain('rgba');
	expect(messages).toEqual([]);
});
