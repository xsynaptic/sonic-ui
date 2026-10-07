import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { mouseOnly } from './pointer.ts';

function readGlass(page: Page): Promise<{ bloom: string; breath: string }> {
	return page.locator('#screen').evaluate((glass) => {
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

function sizeOf(
	page: Page,
	selector: string,
): Promise<{ height: number; row: number | undefined; width: number }> {
	return page.locator(selector).evaluate((screen) => {
		const { height, width } = screen.getBoundingClientRect();

		return { height, row: screen.parentElement?.clientWidth, width };
	});
}

test('glass breathes only while hovered, and holds still under reduced motion', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	await page.goto('/fixtures/');
	expect(await readGlass(page)).toMatchObject({ breath: 'none' });

	await page.locator('#screen').hover();
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
		.locator('#screen')
		.evaluate((glass) => getComputedStyle(glass, '::before').opacity);

	expect(bloom).toBe('0');

	await page.emulateMedia({ forcedColors: 'active' });

	const forced = await readGlass(page);

	expect(forced.bloom).toBe('none');
});

test(
	'a readout takes the glass font, and a screen is cut from glass, sized like a div and filled by a strip',
	{ tag: '@mobile' },
	async ({ page }) => {
		await page.goto('/fixtures/');

		await test.step('--sonic-glass-font reaches the readout and its entry; unset, the readout inherits', async () => {
			const host = page.locator('#level');
			const readout = host.locator('.sonic-dial-readout');

			await host.evaluate((element) => {
				element.style.fontFamily = 'serif';
			});
			expect.soft(await readFont(readout)).toBe('serif');

			await host.evaluate((element) => {
				element.style.setProperty('--sonic-glass-font', 'monospace');
			});
			expect.soft(await readFont(readout)).toBe('monospace');
			expect.soft(await readFont(host.locator('.sonic-dial-entry'))).toBe('monospace');
		});

		await test.step('a screen is sized like a div: it fills a block, hugs in a flex row and grows with what it holds', async () => {
			const hugging = await sizeOf(page, '#screen');
			const tall = await sizeOf(page, '#screen-tall');
			const block = await sizeOf(page, '#screen-block');

			expect.soft(block.width).toBe(block.row);
			expect.soft(block.height).toBe(40);
			expect.soft(hugging.height).toBe(40);
			expect.soft(hugging.width).toBeGreaterThan(20);
			expect.soft(hugging.width).toBeLessThan(120);
			expect.soft(tall.width).toBe(80);
			expect.soft(tall.height).toBeGreaterThan(60);
		});

		await test.step('a strip that fills a screen with a height takes its content box, and keeps it', async () => {
			const screen = page.locator('#screen-strip');

			await screen.scrollIntoViewIfNeeded();
			await expect.soft(screen.locator('canvas')).toBeVisible();

			const readBoxes = () =>
				screen.evaluate(async (glass) => {
					for (let frame = 0; frame < 10; frame++) {
						await new Promise((resolve) => {
							requestAnimationFrame(resolve);
						});
					}

					const strip = glass.querySelector('.sonic-wavestrip');
					if (!strip) throw new Error('The screen holds no strip');

					const style = getComputedStyle(glass);
					const outer = glass.getBoundingClientRect();
					const inner = strip.getBoundingClientRect();
					const edge = glass.clientTop + Number(style.paddingTop.replace('px', ''));

					return {
						content: [
							outer.x + edge,
							outer.y + edge,
							outer.width - 2 * edge,
							outer.height - 2 * edge,
						],
						row: glass.parentElement?.clientWidth,
						strip: [inner.x, inner.y, inner.width, inner.height],
					};
				});
			const first = await readBoxes();

			expect.soft(first.content.slice(2)).toEqual([(first.row ?? 0) - 8, 72]);
			expect.soft(first.strip).toEqual(first.content);
			expect.soft(await readBoxes()).toEqual(first);
		});

		await test.step('a screen sizes every edge from its token', async () => {
			const readBox = () =>
				page.locator('#screen').evaluate((screen) => {
					const style = getComputedStyle(screen);
					const box = screen.getBoundingClientRect();

					return [box.height, style.paddingTop, style.borderTopLeftRadius].join(' ');
				});

			expect.soft(await readBox()).toBe('40 4px 6px');

			await page.locator('#screen').evaluate((screen) => {
				screen.style.setProperty('--sonic-screen-size', '5rem');
			});
			expect.soft(await readBox()).toBe('80 8px 12px');
		});
	},
);

test('a screen with no glass depth leaves the well of a button inside it alone', async ({
	page,
}) => {
	await page.goto('/fixtures/');

	const wellOf = (host: string): Promise<string> =>
		page.locator(`${host} .sonic-button`).evaluate((button) => getComputedStyle(button).boxShadow);
	const inside = await wellOf('#glass-button');

	expect(inside).toMatch(/[1-9]\d*(\.\d+)?px/);
	expect(inside).toBe(await wellOf('#next'));
});

test('the text on a screen can be selected', async ({ isMobile, page }) => {
	test.skip(isMobile, mouseOnly);

	await page.goto('/fixtures/');

	// The middle of `440 Hz` is its space, so the press lands on the first figure
	const figure = await page.locator('#screen').evaluate((screen) => {
		const text = document.createRange();

		text.selectNodeContents(screen);

		const { height, left, top } = text.getBoundingClientRect();

		return { x: left + 3, y: top + height / 2 };
	});

	await page.mouse.dblclick(figure.x, figure.y);

	expect(await page.evaluate(() => getSelection()?.toString().trim())).toBe('440');
});
