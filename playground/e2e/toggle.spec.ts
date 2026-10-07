import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { centerOf, mouseOnly } from './pointer.ts';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
});

function readWell(page: Page): Promise<string> {
	return page
		.locator('#route .sonic-toggle-well')
		.evaluate((well) => getComputedStyle(well).backgroundImage);
}

// The tint eases, so a reading waits for it to leave the last one and then to settle
async function readNextWell(page: Page, last: string): Promise<string> {
	await expect.poll(() => readWell(page)).not.toBe(last);
	await page
		.locator('#route .sonic-toggle-well')
		.evaluate((well) => Promise.all(well.getAnimations().map((animation) => animation.finished)));

	return readWell(page);
}

function readCapOffset(page: Page, id = 'route'): Promise<number> {
	return page
		.locator(`#${id} .sonic-toggle-cap`)
		.evaluate((cap) => Number(/^-?[\d.]+/.exec(getComputedStyle(cap).translate)?.[0]));
}

test(
	'a trusted press on a position goes there, and the well lights in that position’s colour',
	{ tag: '@mobile' },
	async ({ page }) => {
		const route = page.locator('#route');
		const unlit = await readWell(page);

		await page.getByRole('radio', { name: 'Dry' }).click();
		await expect(route).toHaveJSProperty('value', 'dry');

		const lit = await readNextWell(page, unlit);

		await page.getByRole('radio', { name: 'Wet' }).click();
		await expect(route).toHaveJSProperty('value', 'wet');

		const ok = await readNextWell(page, lit);

		expect(ok).not.toBe(unlit);

		await route.locator('.sonic-toggle [data-sonic-lit="ok"]').evaluate((legend) => {
			legend.dataset.sonicLit = 'danger';
		});

		const danger = await readNextWell(page, ok);

		expect(danger).not.toBe(lit);

		await page.getByRole('radio', { name: 'Thru' }).click();
		await expect.poll(() => readWell(page)).toBe(unlit);
	},
);

test('a trusted drag carries the cap, sets the value on crossing halfway, and settles on release', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const route = page.locator('#route');
	const at = await centerOf(page.locator('#route .sonic-toggle-cap'));

	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.move(at.x + 10, at.y, { steps: 4 });

	await expect(route).toHaveJSProperty('value', 'off');
	expect(await readCapOffset(page)).toBeCloseTo(10, 0);

	await page.mouse.move(at.x + 14, at.y, { steps: 2 });
	await expect(route).toHaveJSProperty('value', 'wet');
	expect(await readCapOffset(page)).toBeCloseTo(14, 0);

	await page.mouse.up();
	await expect.poll(() => readCapOffset(page)).toBeCloseTo(24, 0);
	await expect(page.getByRole('radio', { name: 'Wet' })).toBeChecked();
});

test('a trusted press flips a toggle with no positions once, and a drag back turns it off', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const link = page.getByRole('switch', { name: 'Link' });
	const well = await centerOf(link);

	await page.mouse.click(well.x, well.y);
	await expect(link).toHaveAttribute('aria-checked', 'true');

	const cap = await centerOf(page.locator('#link .sonic-toggle-cap'));

	await page.mouse.move(cap.x, cap.y);
	await page.mouse.down();
	await page.mouse.move(cap.x - 16, cap.y, { steps: 4 });
	await expect(link).toHaveAttribute('aria-checked', 'false');
	await page.mouse.up();
	await expect(link).toHaveAttribute('aria-checked', 'false');
});

test('with no skin, a trusted press that wobbles on the cap still flips, and the cap shrinks once and grows once', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	await page.evaluate(() => {
		document.documentElement.classList.remove('sonic-skin-amber');
	});

	const link = page.getByRole('switch', { name: 'Link' });
	const cap = page.locator('#link .sonic-toggle-cap');
	const at = await centerOf(cap);

	await cap.evaluate((element) => {
		element.dataset.scaled = '0';
		element.addEventListener('transitionrun', (event) => {
			if (!(event instanceof TransitionEvent) || event.propertyName !== 'scale') return;

			element.dataset.scaled = String(Number(element.dataset.scaled) + 1);
		});
	});
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.move(at.x + 2, at.y);
	await page.mouse.move(at.x + 4, at.y + 1);
	await expect.poll(() => cap.evaluate((element) => getComputedStyle(element).scale)).toBe('0.985');
	await page.mouse.up();

	await expect(link).toHaveAttribute('aria-checked', 'true');
	await expect.poll(() => cap.evaluate((element) => getComputedStyle(element).scale)).toBe('1');
	await expect(cap).toHaveAttribute('data-scaled', '2');
});

test('a held cap shrinks with no relief too', async ({ isMobile, page }) => {
	test.skip(isMobile, mouseOnly);

	const cap = page.locator('#route .sonic-toggle-cap');

	await page.evaluate(() => {
		document.documentElement.classList.replace('sonic-skin-amber', 'sonic-skin-flat');
	});

	const at = await centerOf(cap);

	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await expect.poll(() => cap.evaluate((element) => getComputedStyle(element).scale)).toBe('0.985');
	await page.mouse.up();
});

type Colour = [number, number, number];

interface Painted {
	ink: Colour;
	legend: Colour;
	lit: Colour;
}

function readPainted(page: Page, legend: string, control: string): Promise<Painted> {
	return page.locator(legend).evaluate((element, controlSelector) => {
		const owner = element.closest(controlSelector);
		const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
		if (!owner || !context) throw new Error('Nothing to read the colours from');

		const probe = document.createElement('span');
		const tokens = getComputedStyle(owner);
		const paint = (colour: string): [number, number, number] => {
			probe.style.color = colour;
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = getComputedStyle(probe).color;
			context.fillRect(0, 0, 1, 1);

			const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;

			return [red, green, blue];
		};

		document.body.append(probe);

		const painted = {
			ink: paint(tokens.getPropertyValue('--_sonic-ink')),
			legend: paint(getComputedStyle(element).color),
			lit: paint(tokens.getPropertyValue('--_sonic-lit')),
		};

		probe.remove();

		return painted;
	}, control);
}

function farthestChannel(first: Colour, second: Colour): number {
	return Math.max(...first.map((channel, index) => Math.abs(channel - (second[index] ?? 0))));
}

const litLegends = [
	{
		control: '.sonic-toggle',
		legend: '#route [aria-checked="true"] > .sonic-toggle-legend',
		name: 'toggle',
	},
	{
		control: '.sonic-segmented-option',
		legend: '#mode .sonic-segmented-option[aria-checked="true"]',
		name: 'segmented',
	},
];

test(
	'a lit legend takes the lit colour where the ink is light, and the ink where the ink is dark',
	{ tag: '@mobile' },
	async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.getByRole('radio', { name: 'Dry' }).click();

		for (const { control, legend, name } of litLegends) {
			await expect
				.poll(
					async () => {
						const painted = await readPainted(page, legend, control);

						return farthestChannel(painted.legend, painted.lit);
					},
					{ message: name },
				)
				.toBe(0);
		}

		await page.evaluate(() => {
			document.documentElement.classList.replace('sonic-skin-amber', 'sonic-skin-ivory');
		});

		for (const { control, legend, name } of litLegends) {
			await expect
				.poll(
					async () => {
						const painted = await readPainted(page, legend, control);

						return farthestChannel(painted.legend, painted.ink);
					},
					{ message: name },
				)
				.toBeLessThanOrEqual(1);

			const painted = await readPainted(page, legend, control);

			expect(farthestChannel(painted.ink, painted.lit), name).toBeGreaterThan(100);
		}
	},
);

test('with no skin an LED on a lit cap has a ring that is not the lens colour, and a skin takes the ring away', async ({
	page,
}) => {
	const readRing = (): Promise<{ lens: Colour; ring: Colour; ringAlpha: number }> =>
		page.locator('#record .sonic-toggle-cap > .sonic-led').evaluate((led) => {
			const context = document
				.createElement('canvas')
				.getContext('2d', { willReadFrequently: true });
			if (!context) throw new Error('No 2d context');

			const paint = (colour: string): [number, number, number, number] => {
				context.clearRect(0, 0, 1, 1);
				context.fillStyle = colour;
				context.fillRect(0, 0, 1, 1);

				const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;

				return [red, green, blue, alpha];
			};
			const probe = document.createElement('span');

			led.append(probe);
			probe.style.color = 'var(--_sonic-lit)';
			probe.style.backgroundColor = getComputedStyle(led).boxShadow.replace(
				/\s-?[\d.]+px.*$|\sinset.*$/,
				'',
			);

			const [lensRed, lensGreen, lensBlue] = paint(getComputedStyle(probe).color);
			const [red, green, blue, ringAlpha] = paint(getComputedStyle(probe).backgroundColor);

			probe.remove();

			return {
				lens: [lensRed, lensGreen, lensBlue],
				ring: [red, green, blue],
				ringAlpha,
			};
		});

	const skinned = await readRing();

	expect(skinned.ringAlpha).toBe(0);

	await page.evaluate(() => {
		document.documentElement.classList.remove('sonic-skin-amber');
	});

	const bare = await readRing();

	expect(bare.ringAlpha).toBe(255);
	expect(farthestChannel(bare.ring, bare.lens)).toBeGreaterThan(100);
});

test('a trusted press holds a momentary position, and the release springs the cap back', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const cue = page.locator('#cue');

	await cue.locator('.sonic-toggle').scrollIntoViewIfNeeded();

	const at = await centerOf(page.getByRole('radio', { name: 'Cue' }));

	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await expect(cue).toHaveJSProperty('value', 'cue');
	await expect.poll(() => readCapOffset(page, 'cue')).toBeCloseTo(-24, 0);

	await page.mouse.move(at.x + 5, at.y + 40, { steps: 2 });
	await expect(cue).toHaveJSProperty('value', 'cue');

	await page.mouse.up();
	await expect(cue).toHaveJSProperty('value', 'idle');
	await expect.poll(() => readCapOffset(page, 'cue')).toBeCloseTo(0, 0);
});

test(
	'a disabled position or option dims by itself, and takes no press',
	{ tag: '@mobile' },
	async ({ page }) => {
		await test.step('one disabled position leaves the toggle undimmed, and every position disabled dims it', async () => {
			const readLegend = (id: string): Promise<string> =>
				page
					.locator(`#${id} [aria-checked="true"] > .sonic-toggle-legend`)
					.evaluate((legend) => getComputedStyle(legend).color);
			const ink = await readLegend('cue');

			await expect.soft(page.getByRole('radio', { name: 'Right' })).toBeDisabled();
			expect.soft(await readLegend('bus')).toBe(ink);

			await page.locator('#bus').evaluate((bus) => {
				for (const child of bus.querySelectorAll(':scope > [data-sonic-value]')) {
					child.toggleAttribute('data-sonic-disabled', true);
				}
			});
			await expect.poll(() => readLegend('bus')).not.toBe(ink);
		});

		await test.step('a disabled option is drawn fainter than its neighbour and a trusted press on it changes nothing', async () => {
			const band = page.locator('#band');
			const mids = page.getByRole('radio', { name: 'Mids' });
			const readColour = (name: string): Promise<string> =>
				page.getByRole('radio', { name }).evaluate((option) => getComputedStyle(option).color);

			await expect.soft(mids).toBeDisabled();
			await band.locator('.sonic-segmented').scrollIntoViewIfNeeded();
			expect.soft(await readColour('Mids')).not.toBe(await readColour('High'));

			const at = await centerOf(mids);

			await page.mouse.click(at.x, at.y);
			await expect.soft(band).toHaveJSProperty('value', 'low');

			await page.getByRole('radio', { name: 'Low' }).focus();
			await page.keyboard.press('ArrowRight');
			await expect.soft(band).toHaveJSProperty('value', 'high');
		});
	},
);
