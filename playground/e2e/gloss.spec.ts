import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

const button = { kind: 'linear', pseudo: '::before', selector: '#kick .sonic-button-cap' };
const dial = { kind: 'conic', pseudo: '::after', selector: '#level .sonic-dial-cap' };
const slider = { kind: 'linear', pseudo: '::before', selector: '#send .sonic-slider-cap' };

interface Sheen {
	kind: string;
	pseudo: string;
	selector: string;
}

function readSheen(page: Page, { kind, pseudo, selector }: Sheen): Promise<number> {
	return page.locator(selector).evaluate(
		(element, [gradientKind, pseudoElement]) => {
			const layers: Array<string> = [];
			let depth = 0;
			let layer = '';

			for (const character of getComputedStyle(element, pseudoElement).backgroundImage) {
				if (character === '(') depth += 1;
				else if (character === ')') depth -= 1;
				if (character === ',' && depth === 0) {
					layers.push(layer.trim());
					layer = '';
					continue;
				}
				layer += character;
			}
			layers.push(layer.trim());

			const sheen = layers.find((candidate) => candidate.startsWith(`${gradientKind ?? ''}-`));

			if (sheen === undefined) return NaN;

			const alphas = (sheen.match(/(?:rgba?|color)\([^)]*\)/g) ?? []).map((colour) => {
				const parts = colour.slice(colour.indexOf('(') + 1, -1).split(/[,/]/);

				return colour.includes('/') || parts.length === 4 ? Number(parts.at(-1)) : 1;
			});

			return Math.max(...alphas);
		},
		[kind, pseudo],
	);
}

function readEdges(page: Page): Promise<Array<string>> {
	return page.locator(button.selector).evaluate((element) => {
		const styles = getComputedStyle(element);

		return [styles.backgroundImage, styles.boxShadow];
	});
}

function setGloss(page: Page, selector: string, value: string): Promise<void> {
	return page.locator(selector).evaluate((element, gloss) => {
		(element as HTMLElement).style.setProperty('--sonic-gloss', gloss);
	}, value);
}

test('gloss scales the sheen on a keycap and a dial face and leaves the rim and skirt alone', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const edges = await readEdges(page);

	expect(await readSheen(page, button)).toBeCloseTo(0.1, 3);
	expect(await readSheen(page, dial)).toBeCloseTo(0.16, 3);

	await setGloss(page, 'html', '0');

	expect(await readSheen(page, button)).toBe(0);
	expect(await readSheen(page, dial)).toBe(0);
	expect(await readEdges(page)).toEqual(edges);

	await setGloss(page, 'html', '2');

	expect(await readSheen(page, button)).toBeCloseTo(0.2, 3);
});

test('a slider cap has no sheen until gloss is set', async ({ page }) => {
	await page.goto('/fixtures/');

	expect(await readSheen(page, slider)).toBe(0);

	await setGloss(page, 'html', '1');

	expect(await readSheen(page, slider)).toBeCloseTo(0.1, 3);
});

test('gloss set on one dial leaves a button beside it alone', async ({ page }) => {
	await page.goto('/fixtures/');
	await setGloss(page, '#level', '0');

	expect(await readSheen(page, dial)).toBe(0);
	expect(await readSheen(page, button)).toBeCloseTo(0.1, 3);
});
