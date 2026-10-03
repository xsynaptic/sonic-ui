import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/mirrored/');
});

async function centrePixel(page: Page, target: Locator): Promise<Array<number>> {
	const shot = await target.screenshot();

	return page.evaluate(
		async (source) => {
			const image = new Image();

			image.src = source;
			await image.decode();

			const canvas = document.createElement('canvas');

			canvas.width = image.width;
			canvas.height = image.height;

			const context = canvas.getContext('2d');
			if (!context) throw new Error('No 2d context');

			context.drawImage(image, 0, 0);

			return [
				...context
					.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1)
					.data.slice(0, 3),
			];
		},
		`data:image/png;base64,${shot.toString('base64')}`,
	);
}

function expectGreen([red = 0, green = 0, blue = 0]: Array<number>): void {
	expect(green).toBeGreaterThan(180);
	expect(Math.max(red, blue)).toBeLessThan(100);
}

for (const name of ['gradient', 'use', 'encoded']) {
	test(`an icon whose ids repeat later on the page paints in the key and after it: ${name}`, async ({
		page,
	}) => {
		expectGreen(await centrePixel(page, page.locator(`#${name} .sonic-key-cap svg`)));
		expectGreen(await centrePixel(page, page.locator(`#${name}-twin`)));
	});
}

test('a style block inside a mirrored icon paints through its prefixed id', async ({ page }) => {
	expectGreen(await centrePixel(page, page.locator('#styled .sonic-key-cap svg')));
});

test('a mirrored original takes no room and no pointer', async ({ page }) => {
	const key = page.locator('#gradient');
	const original = key.locator(':scope > svg');

	await expect(original).toBeHidden();
	expect(await original.evaluate((icon) => getComputedStyle(icon).visibility)).toBe('hidden');
	expect(
		await key.evaluate((host) => {
			const box = host.querySelector('.sonic-key')?.getBoundingClientRect();
			if (!box) throw new Error('No key');

			const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);

			return hit?.closest('.sonic-key') !== null;
		}),
	).toBe(true);
	expect(
		await page.evaluate(() => {
			const root = document.documentElement;

			return root.scrollWidth <= root.clientWidth && root.scrollHeight <= root.clientHeight;
		}),
	).toBe(true);
});

test('keys cloned or written back from their own markup hold one button and still paint', async ({
	page,
}) => {
	await page.evaluate(() => {
		const main = document.querySelector('main');
		const worded = document.querySelector('#worded');
		if (!main || !worded) throw new Error('The fixture is missing');

		main.innerHTML = main.getHTML();
		main.append(worded.cloneNode(true));
	});

	await expect(page.locator('sonic-key')).toHaveCount(6);
	await expect(page.locator('sonic-key button')).toHaveCount(6);
	await expect(page.locator('#worded .sonic-key-cap').last()).toHaveText('Go');
	expectGreen(await centrePixel(page, page.locator('#gradient .sonic-key-cap svg')));
});

// Playwright's own tree counts a text node by its parent's style, so this reads the browser's tree
test('a mirrored original has no place in the accessibility tree', async ({
	browserName,
	page,
}) => {
	test.skip(browserName !== 'chromium', 'The accessibility tree is read over CDP');

	const session = await page.context().newCDPSession(page);
	const { nodes } = await session.send('Accessibility.getFullAXTree');

	await session.detach();

	expect(
		nodes.filter(
			(node) => !node.ignored && node.role?.value === 'StaticText' && node.name?.value === 'Go',
		),
	).toHaveLength(1);
});
