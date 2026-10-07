import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { systemColour } from './colour.ts';
import { boxOf, centerOf, mouseOnly } from './pointer.ts';
import { readState, stillTransitions } from './state.ts';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
});

function readInk(page: Page, id: string): Promise<string> {
	return page.locator(`#${id} .sonic-button`).evaluate((button) => getComputedStyle(button).color);
}

test(
	'an armed button inks apart from a plain button and a latched one, and latches to the latched ink',
	{ tag: '@mobile' },
	async ({ page }) => {
		await stillTransitions(page);

		const [plain, armed] = [await readInk(page, 'next'), await readInk(page, 'armed')];

		await page.locator('#mute .sonic-button').click();

		const latched = await readInk(page, 'mute');

		expect(latched).not.toBe(plain);
		expect(armed).not.toBe(plain);
		expect(armed).not.toBe(latched);

		await page.locator('#armed .sonic-button').click();
		expect(await readInk(page, 'armed')).toBe(latched);
	},
);

test('a busy button pulses its legend after its delay, and holds it steady under reduced motion', async ({
	page,
}) => {
	const legend = page.locator('#loading .sonic-button-cap > svg');

	await expect(legend).toHaveCSS('animation-name', 'sonic-button-busy');
	await expect(page.locator('#loading-delayed .sonic-button-cap > svg')).toHaveCSS(
		'animation-delay',
		'0.4s',
	);

	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect(legend).toHaveCSS('animation-name', 'none');
	await expect(legend).toHaveCSS('opacity', '1');
});

test('a disabled button is drawn in the disabled ink', async ({ page }) => {
	await page.locator('#next').evaluate((element) => {
		element.style.setProperty('--sonic-ink-disabled', 'rgb(1, 2, 3)');
		element.setAttribute('disabled', '');
	});

	await expect(page.locator('#next .sonic-button')).toHaveCSS('color', 'rgb(1, 2, 3)');
});

test('a button is lit while expanded, as a latched one is', async ({ page }) => {
	const host = page.locator('#next');
	const button = host.locator('.sonic-button');

	await host.evaluate((element) => {
		element.style.setProperty('--sonic-lit', 'rgb(1, 200, 3)');
		element.setAttribute('expanded', 'false');
	});
	await expect(button).not.toHaveCSS('color', 'rgb(1, 200, 3)');

	await host.evaluate((element) => {
		element.setAttribute('expanded', 'true');
	});
	await expect(button).toHaveCSS('color', 'rgb(1, 200, 3)');
});

test.describe('forced colours', () => {
	test.use({ forcedColors: 'active' });
	test.skip(({ browserName }) => browserName === 'webkit', 'WebKit has no forced-colours mode');

	test('a disabled button takes the system colour over the disabled ink', async ({ page }) => {
		await page.locator('#next').evaluate((element) => {
			element.style.setProperty('--sonic-ink-disabled', 'rgb(1, 2, 3)');
			element.setAttribute('disabled', '');
		});

		await expect(page.locator('#next .sonic-button')).toHaveCSS(
			'color',
			await systemColour(page, 'GrayText'),
		);
	});
});

function scaleOf(cap: Locator): () => Promise<string> {
	return () => cap.evaluate((element) => getComputedStyle(element).scale);
}

const atRest = /^(1|none)$/;

test('Space holds a button’s cap down, and lifting or leaving lets it up', async ({
	browserName,
	page,
}) => {
	const scale = scaleOf(page.locator('#next .sonic-button-cap'));

	await page.locator('#next .sonic-button').focus();
	await page.keyboard.down('Space');
	await expect.poll(scale).toBe('0.985');

	await page.keyboard.up('Space');
	await expect.poll(scale).toMatch(atRest);

	// WebKit leaves `:active` on a button that focus left mid-hold, and the pointer still needs `:active`
	if (browserName === 'webkit') return;

	await page.keyboard.down('Space');
	await expect.poll(scale).toBe('0.985');
	await page.keyboard.press('Tab');
	await expect.poll(scale).toMatch(atRest);
});

test('Space holds an option’s cap down, and leaving or an arrow lets it up', async ({ page }) => {
	const option = page.getByRole('radio', { name: 'HP' });
	const scale = scaleOf(option.locator('.sonic-segmented-cap'));

	await option.focus();
	await page.keyboard.down('Space');
	await expect.poll(scale).toBe('0.985');

	await page.keyboard.press('Tab');
	await expect.poll(scale).toMatch(atRest);
	await page.keyboard.up('Space');

	await option.focus();
	await page.keyboard.down('Space');
	await expect.poll(scale).toBe('0.985');
	await page.keyboard.press('ArrowLeft');
	await expect(page.getByRole('radio', { name: 'LP' })).toBeFocused();
	await expect.poll(scale).toMatch(atRest);
});

test('Space holds a toggle’s cap down and lets it up again', async ({ page }) => {
	const scale = scaleOf(page.locator('#route .sonic-toggle-cap'));

	await page.locator('#route .sonic-toggle-position[tabindex="0"]').focus();
	await page.keyboard.down('Space');
	await expect.poll(scale).toBe('0.985');

	await page.keyboard.up('Space');
	await expect.poll(scale).toMatch(atRest);
});

function readChanges(page: Page): Promise<string | undefined> {
	return page.evaluate(() => document.body.dataset.kick);
}

test.describe('momentary', () => {
	test.beforeEach(async ({ page }) => {
		await page.evaluate(() => {
			document.body.dataset.kick = '';
			document.body.addEventListener('change', (event) => {
				if (!(event.target instanceof HTMLElement) || event.target.id !== 'kick') return;

				const { dataset } = document.body;

				dataset.kick = `${dataset.kick ?? ''}${event.target.matches(':state(pressed)') ? 'down' : 'up'} `;
			});
		});
	});

	test('a momentary button stays pressed until the pointer lifts, even off the button', async ({
		isMobile,
		page,
	}) => {
		test.skip(isMobile, mouseOnly);

		const kick = page.locator('#kick');
		const at = await centerOf(kick.locator('.sonic-button'));

		await page.mouse.move(at.x, at.y);
		await page.mouse.down();
		expect(await readState(kick, 'pressed')).toBe(true);

		await page.mouse.move(at.x + 80, at.y - 80, { steps: 4 });
		expect(await readState(kick, 'pressed')).toBe(true);

		await page.mouse.up();
		expect(await readState(kick, 'pressed')).toBe(false);
		expect(await readChanges(page)).toBe('down up ');
	});

	test('Space holds a momentary button until the key lifts, and focus leaving mid-hold lets it go', async ({
		page,
	}) => {
		const kick = page.locator('#kick');

		await kick.locator('.sonic-button').focus();
		await page.keyboard.down('Space');
		expect(await readState(kick, 'pressed')).toBe(true);

		await page.keyboard.up('Space');
		expect(await readState(kick, 'pressed')).toBe(false);

		await page.keyboard.down('Space');
		await page.keyboard.press('Tab');
		expect(await readState(kick, 'pressed')).toBe(false);

		await page.keyboard.up('Space');
		expect(await readChanges(page)).toBe('down up down up ');
	});
});

test(
	'a ring sizes and rounds the button it holds, centerd inside the arc, and the button still takes its presses',
	{ tag: '@mobile' },
	async ({ page }) => {
		const ring = page.locator('#ring-button');
		const button = ring.locator('.sonic-button');
		const [outer, inner] = [await boxOf(ring), await boxOf(button)];

		expect(outer.width).toBeCloseTo(40, 1);
		expect(outer.height).toBeCloseTo(40, 1);
		expect(inner.width).toBeCloseTo(30, 1);
		expect(inner.height).toBeCloseTo(30, 1);
		expect(inner.x - outer.x).toBeCloseTo(5, 1);
		expect(inner.y - outer.y).toBeCloseTo(5, 1);
		await expect(button).toHaveCSS('border-radius', '15px');
		await expect(button.locator('.sonic-button-cap')).toHaveCSS('border-radius', '15px');

		const named = page.getByRole('button', { name: 'Loop position' });

		await named.click();
		await expect(named).toHaveAttribute('aria-pressed', 'true');
	},
);

test('a focused button keeps focus when it turns soft-disabled, and its presses reach nothing', async ({
	page,
}) => {
	const host = page.locator('#next');
	const button = page.getByRole('button', { name: 'Next' });

	await host.evaluate((element) => {
		element.addEventListener('click', () => {
			element.dataset.clicked = '';
		});
	});
	await button.focus();
	await host.evaluate((element) => {
		element.setAttribute('soft-disabled', '');
	});
	await expect(button).toBeFocused();
	await expect(button).toHaveAttribute('aria-disabled', 'true');

	// Playwright waits for an `aria-disabled` button to enable, so `force` clicks it as it stands
	await page.keyboard.press('Enter');
	await button.click({ force: true });
	await expect(host).not.toHaveAttribute('data-clicked');
});
