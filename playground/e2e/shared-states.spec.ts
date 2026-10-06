import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { centerOf, mouseOnly } from './pointer.ts';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
});

async function setTokens(page: Page, tokens: Record<string, string>): Promise<void> {
	await page.evaluate((entries) => {
		for (const [name, value] of entries) document.body.style.setProperty(name, value);
	}, Object.entries(tokens));
}

async function holdOn(page: Page, target: Locator): Promise<void> {
	const at = await centerOf(target);

	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
}

test('a latched button rests at the latched scale and dips to the press scale while held', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const button = page.locator('#mute .sonic-button');
	const cap = page.locator('#mute .sonic-button-cap');

	await setTokens(page, { '--sonic-button-press-scale': '0.9' });
	await button.click();
	await expect(button).toHaveAttribute('aria-pressed', 'true');
	await expect(cap).toHaveCSS('scale', '0.9');

	await setTokens(page, { '--sonic-button-latched-scale': '1' });
	await expect(cap).toHaveCSS('scale', '1');

	await holdOn(page, button);
	await expect(cap).toHaveCSS('scale', '0.9');
	await page.mouse.up();
});

test('a chosen option rests at the latched scale and dips to the press scale while held', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const chosen = page.locator('#mode .sonic-segmented-option[aria-checked="true"]');
	const cap = chosen.locator('.sonic-segmented-cap');

	await setTokens(page, { '--sonic-segmented-press-scale': '0.9' });
	await expect(cap).toHaveCSS('scale', '0.9');

	await setTokens(page, { '--sonic-segmented-latched-scale': '1' });
	await expect(cap).toHaveCSS('scale', '1');

	await holdOn(page, chosen);
	await expect(cap).toHaveCSS('scale', '0.9');
	await page.mouse.up();
});

test('keyboard focus draws the focus outline, and no glow at strength 0', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	await setTokens(page, {
		'--sonic-focus-glow': '0',
		'--sonic-focus-outline': '3px solid rgb(1, 2, 3)',
		'--sonic-focus-outline-offset': '4px',
	});

	for (const selector of [
		'#next .sonic-button',
		'#send .sonic-slider',
		'#route .sonic-toggle-position[tabindex="0"]',
		'#talk .sonic-switch-position[tabindex="0"]',
	]) {
		const target = page.locator(selector);

		await target.focus();
		await expect(target).toBeFocused();
		await expect(target).toHaveCSS('outline-color', 'rgb(1, 2, 3)');
		await expect(target).toHaveCSS('outline-width', '3px');
		await expect(target).toHaveCSS('outline-offset', '4px');
	}

	const cap = page.locator('#next .sonic-button-cap');
	const glow = (): Promise<string> =>
		cap.evaluate((element) => {
			const shadow = getComputedStyle(element).boxShadow;

			return shadow.slice(shadow.search(/[a-z]+\([^(]*$/));
		});

	await page.locator('#next .sonic-button').focus();
	await expect.poll(glow).not.toMatch(/ 0px 0px 0px 0px$/);
	expect(await glow()).toMatch(/[/,] 0\)/);

	await setTokens(page, { '--sonic-focus-glow': '1' });
	await expect.poll(glow).not.toMatch(/[/,] 0\)/);
});

test('a press focuses a slider without the focus outline', async ({ isMobile, page }) => {
	test.skip(isMobile, mouseOnly);

	const slider = page.locator('#send .sonic-slider');

	await setTokens(page, { '--sonic-focus-outline': '3px solid rgb(1, 2, 3)' });
	await holdOn(page, slider);
	await expect(slider).toBeFocused();
	await expect(slider).not.toHaveCSS('outline-color', 'rgb(1, 2, 3)');
	await page.mouse.up();
});

async function disable(page: Page): Promise<void> {
	await setTokens(page, { '--sonic-disabled-opacity': '0.4' });
	for (const id of ['#next', '#send', '#route', '#talk', '#mode']) {
		await page.locator(id).evaluate((element) => {
			element.setAttribute('disabled', '');
		});
	}
}

test('a disabled control fades to the disabled opacity', async ({ page }) => {
	await disable(page);
	for (const selector of [
		'#next .sonic-button',
		'#send .sonic-slider',
		'#route .sonic-toggle',
		'#talk .sonic-switch',
		'#mode .sonic-segmented-option[aria-checked="true"]',
	]) {
		await expect(page.locator(selector)).toHaveCSS('opacity', '0.4');
	}
	await expect(page.locator('#mute .sonic-button')).toHaveCSS('opacity', '1');
});

test.describe('forced colours', () => {
	test.use({ forcedColors: 'active' });

	test('a disabled control keeps full opacity', async ({ page }) => {
		await disable(page);
		await expect(page.locator('#next .sonic-button')).toHaveCSS('opacity', '1');
	});
});
