import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
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

	test('a disabled button takes the system colour over the disabled ink', async ({ page }) => {
		const colours = await page.locator('#next').evaluate((element) => {
			element.style.setProperty('--sonic-ink-disabled', 'rgb(1, 2, 3)');
			element.setAttribute('disabled', '');

			const probe = document.createElement('span');

			probe.style.color = 'GrayText';
			document.body.append(probe);

			const button = element.querySelector('.sonic-button');
			if (!button) throw new Error('The button is not drawn');

			return [getComputedStyle(button).color, getComputedStyle(probe).color];
		});

		expect(colours[0]).toBe(colours[1]);
	});
});
