import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
});

async function setLabel(host: Locator, text: string, tokens: Record<string, string> = {}) {
	await host.evaluate(
		(element, { entries, text }) => {
			const legend = document.createElement('span');

			legend.textContent = text;
			element.replaceChildren(legend);
			for (const [name, value] of entries) element.style.setProperty(name, value);
		},
		{ entries: Object.entries(tokens), text },
	);
	await expect(host.locator('.sonic-button-cap > span')).toHaveText(text);
}

async function boxOf(target: Locator) {
	const box = await target.boundingBox();
	if (!box) throw new Error('The target has no box');

	return box;
}

const geometry = {
	'--sonic-button-aspect-ratio': '1.5',
	'--sonic-button-gap-ratio': '0.1',
	'--sonic-button-padding-ratio': '0.4',
	'--sonic-button-size': '40px',
};

test('a long label widens the button by its padding and gap, and a short one keeps the least width', async ({
	page,
}) => {
	const host = page.locator('#next');
	const button = host.locator('.sonic-button');
	const legend = host.locator('.sonic-button-cap > span');

	await host.evaluate((element, entries) => {
		for (const [name, value] of entries) element.style.setProperty(name, value);
	}, Object.entries(geometry));
	expect(await boxOf(button)).toMatchObject({ height: 40, width: 60 });

	await setLabel(host, 'Shuffle the queue', geometry);
	await expect(legend).toHaveCSS('padding-left', '16px');

	const wide = await boxOf(button);
	const text = await boxOf(legend);

	expect(wide.height).toBe(40);
	expect(wide.width).toBeGreaterThan(60);
	expect(wide.width).toBeCloseTo(text.width + 8, 0);

	await setLabel(host, 'M', geometry);
	expect(await boxOf(button)).toMatchObject({ height: 40, width: 60 });
});

async function setIcon(host: Locator, viewBox: string, tokens: Record<string, string>) {
	await host.evaluate(
		(element, { entries, viewBox }) => {
			const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

			icon.setAttribute('viewBox', viewBox);
			element.replaceChildren(icon);
			for (const [name, value] of entries) element.style.setProperty(name, value);
		},
		{ entries: Object.entries(tokens), viewBox },
	);
	await expect(host.locator('.sonic-button-cap > svg')).toHaveAttribute('viewBox', viewBox);
}

test('an icon keeps its proportions, and the button widens to fit it or narrows to it with no least width', async ({
	page,
}) => {
	const host = page.locator('#next');
	const button = host.locator('.sonic-button');
	const icon = host.locator('.sonic-button-cap > svg');
	const size = { '--sonic-button-icon-ratio': '0.6', '--sonic-button-size': '40px' };

	await setIcon(host, '0 0 30 10', size);
	expect(await boxOf(icon)).toMatchObject({ height: 24, width: 72 });
	expect(await boxOf(button)).toMatchObject({ height: 40, width: 72 });

	await setIcon(host, '0 0 5 10', size);
	expect(await boxOf(icon)).toMatchObject({ height: 24, width: 12 });
	expect(await boxOf(button)).toMatchObject({ height: 40, width: 40 });

	await setIcon(host, '0 0 5 10', { ...size, '--sonic-button-aspect-ratio': '0' });
	expect(await boxOf(button)).toMatchObject({ height: 40, width: 12 });
});

async function addToColumn(page: Page): Promise<Locator> {
	await page.evaluate(() => {
		const column = document.createElement('div');
		const host = document.createElement('sonic-button');
		const legend = document.createElement('span');

		column.id = 'column';
		column.style.cssText = 'display: flex; flex-direction: column; inline-size: 400px';
		legend.textContent = 'Clear';
		host.append(legend);
		column.append(host);
		document.body.append(column);
	});

	return page.locator('#column .sonic-button');
}

test('a label button in a column keeps its own width', async ({ page }) => {
	const button = await addToColumn(page);
	const box = await boxOf(button);

	expect(box.width).toBeLessThan(200);
});

test('a label fits inside a small cap', async ({ page }) => {
	const host = page.locator('#next');

	await setLabel(host, 'Shuffle', {
		'--sonic-button-font-ratio': '0.6',
		'--sonic-button-size': '20px',
	});

	const cap = await boxOf(host.locator('.sonic-button-cap'));
	const legend = await boxOf(host.locator('.sonic-button-cap > span'));

	expect(legend.height).toBe(12);
	expect(legend.y).toBeGreaterThanOrEqual(cap.y);
	expect(legend.y + legend.height).toBeLessThanOrEqual(cap.y + cap.height);
	expect(legend.x).toBeGreaterThanOrEqual(cap.x);
	expect(legend.x + legend.width).toBeLessThanOrEqual(cap.x + cap.width);
});

test('a latched label takes the lit legend glow', async ({ page }) => {
	const host = page.locator('#mute');
	const legend = host.locator('.sonic-button-cap > span');

	await setLabel(host, 'Mute');

	const readFilter = (): Promise<string> =>
		legend.evaluate((element) => getComputedStyle(element).filter);
	const rest = await readFilter();

	await host.locator('.sonic-button').click();
	await expect(host.locator('.sonic-button')).toHaveAttribute('aria-pressed', 'true');
	await expect.poll(readFilter).not.toBe(rest);
});

test('a label button inside a ring stays as wide as it is tall', async ({ page }) => {
	const host = page.locator('#ring-button sonic-button');

	await setLabel(host, 'Shuffle the queue');

	const box = await boxOf(host.locator('.sonic-button'));

	expect(box.width).toBeCloseTo(box.height, 1);
});
