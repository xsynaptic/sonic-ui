import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { boxOf, centerOf, mouseOnly } from './pointer.ts';

function readOpen(readout: Locator): Promise<boolean> {
	return readout.evaluate((element) => element.matches(':popover-open'));
}

// Whole pixels, since Firefox and WebKit round the pointer
async function pressDial(page: Page): Promise<{ x: number; y: number }> {
	const box = await boxOf(page.locator('#level .sonic-dial'));

	const start = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();

	return start;
}

async function hold(page: Page, part: Locator, by: { x: number; y: number }): Promise<void> {
	await part.evaluate((element) => {
		element.scrollIntoView({ block: 'center' });
	});

	const start = await centerOf(part);

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + by.x, start.y + by.y, { steps: 4 });
}

async function expectAbove(readout: Locator, part: Locator): Promise<void> {
	await expect(readout).toBeVisible();

	const [bubble, anchor] = [await boxOf(readout), await boxOf(part)];

	const gap = anchor.y - (bubble.y + bubble.height);

	expect(Math.abs(bubble.x + bubble.width / 2 - (anchor.x + anchor.width / 2))).toBeLessThan(1.5);
	expect(gap).toBeGreaterThanOrEqual(0);
	expect(gap).toBeLessThan(bubble.height);
}

test.describe('reveal', () => {
	test.skip(({ isMobile }) => isMobile, mouseOnly);

	test.beforeEach(async ({ page }) => {
		await page.clock.install({ time: 0 });
		await page.goto('/fixtures/');
		await page.clock.pauseAt(60_000);
	});

	test('a held press shows the readout after 250ms, until release, and a 4px drag shows it at once', async ({
		page,
	}) => {
		const readout = page.locator('#level .sonic-dial-readout');

		await pressDial(page);
		expect(await readOpen(readout)).toBe(false);

		await page.clock.runFor(250);
		expect(await readOpen(readout)).toBe(true);

		await page.mouse.up();
		expect(await readOpen(readout)).toBe(false);

		// Past the double-press window, so the second press is a press of its own
		await page.clock.runFor(1000);

		const start = await pressDial(page);

		expect(await readOpen(readout)).toBe(false);

		await page.mouse.move(start.x, start.y - 4);
		expect(await readOpen(readout)).toBe(true);
	});

	test('the reveal delay token sets how long a held press waits', async ({ page }) => {
		const readout = page.locator('#level .sonic-dial-readout');

		await page.locator('#level').evaluate((host) => {
			host.style.setProperty('--sonic-reveal-delay', '0.4s');
		});
		await pressDial(page);
		await page.clock.runFor(399);
		expect(await readOpen(readout)).toBe(false);

		await page.clock.runFor(1);
		expect(await readOpen(readout)).toBe(true);
	});

	test('a key shows the readout, which hides a second after the last key', async ({ page }) => {
		const readout = page.locator('#level .sonic-dial-readout');

		await page.getByRole('slider', { name: 'Level' }).focus();
		await page.keyboard.press('ArrowUp');
		expect(await readOpen(readout)).toBe(true);

		await page.clock.runFor(900);
		await page.keyboard.press('ArrowUp');
		await page.clock.runFor(900);
		expect(await readOpen(readout)).toBe(true);

		await page.clock.runFor(100);
		expect(await readOpen(readout)).toBe(false);
	});
});

test.describe('placement', () => {
	test.use({ reducedMotion: 'reduce' });

	test(
		'a closed readout is not rendered, and opens above a dial in a filtered bar with room below it',
		{ tag: '@mobile' },
		async ({ page }) => {
			await page.goto('/fixtures/docked/');
			await page.evaluate(() => {
				window.scrollTo(0, document.body.scrollHeight);
			});

			const host = page.locator('#docked');

			await expect(host.locator('.sonic-dial-readout')).toHaveCSS('display', 'none');
			await host.getByRole('slider').focus();
			await page.keyboard.press('ArrowUp');
			await expect(host.locator('.sonic-dial-readout')).toBeVisible();

			const gap = await host.evaluate((element) => {
				const dial = element.querySelector('.sonic-dial')?.getBoundingClientRect();
				const readout = element.querySelector('.sonic-dial-readout')?.getBoundingClientRect();
				if (!dial || !readout) throw new Error('The dial did not render');

				return dial.top - readout.bottom;
			});

			expect(gap).toBeGreaterThanOrEqual(0);
		},
	);

	test(
		'the readout stays above a dial in a sticky filtered bar wherever the page is scrolled',
		{ tag: '@mobile' },
		async ({ page }) => {
			await page.goto('/fixtures/docked/');

			const host = page.locator('#sticky');
			const gaps: Array<number> = [];

			for (const share of [0, 0.3, 0.6, 1]) {
				await page.evaluate((at) => {
					window.scrollTo(0, (document.body.scrollHeight - window.innerHeight) * at);
				}, share);
				await host.getByRole('slider').focus();
				await page.keyboard.press('ArrowUp');
				await expect(host.locator('.sonic-dial-readout')).toBeVisible();
				gaps.push(
					await host.evaluate((element) => {
						const dial = element.querySelector('.sonic-dial')?.getBoundingClientRect();
						const readout = element.querySelector('.sonic-dial-readout')?.getBoundingClientRect();
						if (!dial || !readout) throw new Error('The dial did not render');

						return dial.top - readout.bottom;
					}),
				);
				await host.getByRole('slider').blur();
				await expect(host.locator('.sonic-dial-readout')).toBeHidden();
			}

			expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0);
		},
	);

	test(
		'a readout size in em follows the control, not the readout',
		{ tag: '@mobile' },
		async ({ page }) => {
			await page.goto('/fixtures/');

			const host = page.locator('#level');

			await host.evaluate((element) => {
				element.style.setProperty('font-size', '20px');
				element.style.setProperty('--sonic-readout-size', '3em');
			});

			const readout = host.locator('.sonic-dial-readout');

			await expect(readout).toHaveCSS('block-size', '60px');
			await expect(readout).toHaveCSS('font-size', '30px');
		},
	);
});

test.describe('over a held point', () => {
	test.use({ reducedMotion: 'reduce' });
	test.skip(({ isMobile }) => isMobile, mouseOnly);

	test.beforeEach(async ({ page }) => {
		await page.goto('/fixtures/');
	});

	test('the XY pad readout names both axes and stays over the puck as it moves', async ({
		page,
	}) => {
		const puck = page.locator('#xy-log .sonic-xy-puck');
		const readout = page.locator('#xy-log .sonic-xy-readout');

		await hold(page, puck, { x: 24, y: 14 });
		await expectAbove(readout, puck);
		await expect(readout).toHaveText(/^Cutoff \d+, Resonance -?[\d.]+$/);

		const first = await centerOf(puck);

		await page.mouse.move(first.x - 40, first.y - 30, { steps: 4 });

		const second = await centerOf(puck);

		expect(second.x).toBeLessThan(first.x - 20);
		await expectAbove(readout, puck);

		await page.mouse.up();
		await expect(readout).toBeHidden();
	});

	test('the envelope readout sits over whichever handle is held', async ({ page }) => {
		const readout = page.locator('#envelope-curves .sonic-envelope-readout');
		const decay = page.locator('#envelope-curves .sonic-envelope-handle[data-sonic-stage="decay"]');
		const attack = page.locator(
			'#envelope-curves .sonic-envelope-handle[data-sonic-stage="attack"]',
		);

		await hold(page, decay, { x: 16, y: 10 });
		await expectAbove(readout, decay);
		await expect(readout).toHaveText(/^\d+, 0\.\d+$/);

		await page.mouse.up();
		await expect(readout).toBeHidden();

		await hold(page, attack, { x: -12, y: 0 });
		await expectAbove(readout, attack);
		await expect(readout).toHaveText(/^\d+$/);
	});
});
