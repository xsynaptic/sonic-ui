import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { mouseOnly } from './pointer.ts';

function readGlass(page: Page): Promise<{ bloom: string; breath: string }> {
	return page.locator('#tempo .sonic-number').evaluate((glass) => {
		const before = getComputedStyle(glass, '::before');

		return {
			bloom: before.content,
			breath: before.animationName,
		};
	});
}

function readFont(target: Locator): Promise<string> {
	return target.evaluate((element) => getComputedStyle(element).fontFamily);
}

test('glass breathes only while hovered, and holds still under reduced motion', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	await page.goto('/fixtures/');
	expect(await readGlass(page)).toMatchObject({ breath: 'none' });

	await page.locator('#tempo .sonic-number').hover();
	expect(await readGlass(page)).toMatchObject({ breath: 'sonic-glass-breathe' });

	await page.emulateMedia({ reducedMotion: 'reduce' });
	expect(await readGlass(page)).toMatchObject({ breath: 'none' });
});

test('the texture token at 0 on an ancestor drops the bloom, and forced colours draw no texture', async ({
	page,
}) => {
	await page.goto('/fixtures/');
	await page.addStyleTag({ content: ':root { --sonic-glass-texture: 0; }' });

	const bloom = await page
		.locator('#tempo .sonic-number')
		.evaluate((glass) => getComputedStyle(glass, '::before').opacity);

	expect(bloom).toBe('0');

	await page.emulateMedia({ forcedColors: 'active' });

	const forced = await readGlass(page);

	expect(forced.bloom).toBe('none');
});

test('--sonic-glass-font reaches the readout and its entry; unset, the readout inherits', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const host = page.locator('#level');
	const readout = host.locator('.sonic-dial-readout');

	await host.evaluate((element) => {
		element.style.fontFamily = 'serif';
	});
	expect(await readFont(readout)).toBe('serif');

	await host.evaluate((element) => {
		element.style.setProperty('--sonic-glass-font', 'monospace');
	});
	expect(await readFont(readout)).toBe('monospace');
	expect(await readFont(host.locator('.sonic-dial-entry'))).toBe('monospace');
});

test('a screen is cut from the glass a number box is, and sizes every edge from its token', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const readPane = (selector: string) =>
		page.locator(selector).evaluate((pane) => {
			const style = getComputedStyle(pane);

			return {
				bloom: getComputedStyle(pane, '::before').backgroundImage,
				fill: `${style.backgroundColor} ${style.backgroundImage}`,
				ink: style.color,
			};
		});
	const readBox = () =>
		page.locator('#screen').evaluate((screen) => {
			const style = getComputedStyle(screen);
			const box = screen.getBoundingClientRect();

			return [box.width, box.height, style.paddingTop, style.borderTopLeftRadius].join(' ');
		});

	expect(await readPane('#screen')).toEqual(await readPane('#tempo .sonic-number'));
	expect(await readBox()).toBe('120 40 4px 6px');

	await page.locator('#screen').evaluate((screen) => {
		screen.style.setProperty('--sonic-screen-size', '5rem');
	});
	expect(await readBox()).toBe('240 80 8px 12px');
});
