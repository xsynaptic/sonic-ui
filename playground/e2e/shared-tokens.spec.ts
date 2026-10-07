import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

function setTokens(target: Locator, tokens: Record<string, string>): Promise<void> {
	return target.evaluate((element: HTMLElement, entries) => {
		for (const [name, value] of entries) element.style.setProperty(name, value);
	}, Object.entries(tokens));
}

function root(page: Page): Locator {
	return page.locator('html');
}

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
});

test('the press and fade durations reach a cap and a readout, and reduced motion still stills the toggle', async ({
	page,
}) => {
	const toggleCap = page.locator('#route .sonic-toggle-cap');

	await setTokens(root(page), {
		'--sonic-fade-duration': '70ms',
		'--sonic-press-duration': '35ms',
	});

	await expect(page.locator('#kick .sonic-button-cap')).toHaveCSS(
		'transition-duration',
		'0.035s, 0.035s, 0.035s',
	);
	await expect(page.locator('#level .sonic-dial-readout')).toHaveCSS(
		'transition-duration',
		'0.07s, 0.07s, 0.07s, 0.07s',
	);
	await expect(toggleCap).toHaveCSS('transition-duration', '0.035s, 0.035s');

	await page.emulateMedia({ reducedMotion: 'reduce' });

	await expect(toggleCap).toHaveCSS('transition-duration', '0s');
});

const legends = [
	{ host: '#kick', part: '.sonic-button-cap > span', token: '--sonic-button-font-ratio' },
	{ host: '#mode', part: '.sonic-segmented-option', token: '--sonic-segmented-font-ratio' },
	{ host: '#talk', part: '.sonic-switch-position', token: '--sonic-switch-font-ratio' },
	{ host: '#route', part: '.sonic-toggle-position', token: '--sonic-toggle-font-ratio' },
];

test('the legend font size reaches the text of each press control, and a control’s own ratio overrides it', async ({
	page,
}) => {
	await page.locator('#kick').evaluate((button) => {
		const legend = document.createElement('span');

		legend.textContent = 'Kick';
		button.replaceChildren(legend);
	});
	await setTokens(root(page), { '--sonic-legend-font-size': '13px' });

	for (const { host, part, token } of legends) {
		const legend = page.locator(`${host} ${part}`).first();

		await expect(legend, host).toHaveCSS('font-size', '13px');

		await setTokens(page.locator(host), { [token]: '0.5' });

		await expect(legend, host).toHaveCSS('font-size', '16px');
	}
});

const corners = [
	{ host: '#kick', part: '.sonic-button', size: '--sonic-button-size' },
	{ host: '#mode', part: '.sonic-segmented', size: '--sonic-segmented-size' },
	{ host: '#tempo', part: '.sonic-number', size: '--sonic-number-size' },
	{ host: '#send', part: '.sonic-slider-cap', size: '--sonic-slider-size' },
	{ host: '#screen', part: '', size: '--sonic-screen-size' },
];
const plain = [
	'#wavestrip .sonic-wavestrip',
	'#waveform .sonic-waveform',
	'#spectrum .sonic-spectrum',
	'#xy .sonic-xy',
	'#envelope .sonic-envelope',
];

test('the shared radius reaches the outer corner of five controls of different sizes and no plain one, and a control’s own ratio overrides it', async ({
	page,
}) => {
	await setTokens(root(page), { '--sonic-radius': '5px' });

	// The face sits a bevel of 0.075 inside a 32px cap
	expect(
		await page
			.locator('#kick .sonic-button-cap')
			.evaluate((cap) => getComputedStyle(cap, '::before').borderTopLeftRadius),
	).toBe('2.6px');
	for (const selector of plain) {
		await expect(page.locator(selector), selector).toHaveCSS('border-top-left-radius', '0px');
	}

	for (const { host, part, size } of corners) {
		const corner = page.locator(`${host} ${part}`.trim()).first();

		await expect(corner, host).toHaveCSS('border-top-left-radius', '5px');

		await setTokens(page.locator(host), { [size]: '80px' });

		await expect(corner, host).toHaveCSS('border-top-left-radius', '5px');
	}

	await setTokens(page.locator('#kick'), { '--sonic-button-radius-ratio': '0.25' });

	await expect(page.locator('#kick .sonic-button')).toHaveCSS('border-top-left-radius', '20px');
});

function readCapShadows(page: Page): Promise<Array<string>> {
	return page
		.locator('#kick .sonic-button-cap')
		.evaluate((cap) => getComputedStyle(cap).boxShadow.split(/,(?![^(]*\))/));
}

function channels(colour: string | undefined): Array<number> {
	return (colour?.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number);
}

// The cap eases its shadow, so each reading waits for the transition to land
test('the shade pole colours a button’s cast shadow and darkens or lightens its rim', async ({
	page,
}) => {
	const [, restRim] = await readCapShadows(page);

	await setTokens(root(page), { '--sonic-shade': 'rgb(51 102 153)' });

	await expect
		.poll(async () => {
			const [drop] = await readCapShadows(page);

			return channels(drop)
				.slice(0, 3)
				.map((channel) => Math.round(channel * 255));
		})
		.toEqual([51, 102, 153]);

	await setTokens(root(page), { '--sonic-shade': '#fff' });

	expect(restRim).toMatch(/^\s*oklab\(/);
	await expect
		.poll(async () => {
			const [, liftedRim] = await readCapShadows(page);

			return channels(liftedRim)[0];
		})
		.toBeGreaterThan((channels(restRim)[0] ?? NaN) + 0.2);
});
