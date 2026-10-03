import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { mouseOnly } from './pointer.ts';

function readGlass(page: Page): Promise<{ bloom: string; breath: string; warp: string }> {
	return page.locator('#tempo .sonic-number').evaluate((glass) => {
		const before = getComputedStyle(glass, '::before');

		return {
			bloom: before.content,
			breath: before.animationName,
			warp: getComputedStyle(glass).filter,
		};
	});
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

test('the texture token at 0 on an ancestor drops the warp and the bloom', async ({ page }) => {
	await page.goto('/fixtures/');
	expect(await readGlass(page)).toMatchObject({ warp: expect.stringContaining('url(') });

	await page.addStyleTag({ content: ':root { --sonic-glass-texture: 0; }' });

	const off = await page.locator('#tempo .sonic-number').evaluate((glass) => ({
		bloom: getComputedStyle(glass, '::before').opacity,
		warp: getComputedStyle(glass).filter,
	}));

	expect(off).toEqual({ bloom: '0', warp: 'none' });
});

test('forced colours draw no texture', async ({ page }) => {
	await page.emulateMedia({ forcedColors: 'active' });
	await page.goto('/fixtures/');

	const forced = await readGlass(page);

	expect(forced.bloom).toBe('none');
	expect(forced.warp).toBe('none');
});
