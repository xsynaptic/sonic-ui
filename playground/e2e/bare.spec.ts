import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

const clear = /^(transparent|rgba\(0, 0, 0, 0\))|\/ 0\)$/;

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/no-skin/');
});

function readEdge(button: Locator): Promise<{ edge: string; faint: string; text: string }> {
	return button.evaluate((element) => {
		const cap = element.querySelector('.sonic-button-cap');
		if (!cap) throw new Error('The button has no cap');

		const shadows = getComputedStyle(cap).boxShadow.split(/,(?![^(]*\))/);
		const probe = document.createElement('i');

		probe.style.backgroundColor = 'color-mix(in oklab, currentcolor 35%, transparent)';
		cap.append(probe);

		const faint = getComputedStyle(probe).backgroundColor;

		probe.remove();

		return {
			edge: shadows[2]?.trim().replace(/ 0px 0px 0px [\d.]+px$/, '') ?? '',
			faint,
			text: getComputedStyle(element).color,
		};
	});
}

async function isEdged(button: Locator, strength: 'faint' | 'text'): Promise<boolean> {
	const edge = await readEdge(button);

	return edge.edge === edge[strength];
}

function readLed(page: Page, id: string): Promise<Record<string, string>> {
	return page.locator(id).evaluate((led) => {
		const probe = document.createElement('i');

		led.append(probe);

		const mixes = Object.fromEntries(
			Object.entries({
				glass: 'color-mix(in oklab, var(--_sonic-unlit) 60%, #000)',
				tint: 'color-mix(in oklab, currentcolor 30%, transparent)',
			}).map(([name, colour]) => {
				probe.style.backgroundColor = colour;

				return [name, getComputedStyle(probe).backgroundColor];
			}),
		);

		probe.remove();

		const lens = getComputedStyle(led, '::after');

		return {
			...mixes,
			bezel: getComputedStyle(led).backgroundColor,
			inset: lens.top,
			lens: lens.backgroundColor,
		};
	});
}

function lightness(colour: string): number {
	return Number(/^okl(?:ab|ch)\(([\d.]+)/.exec(colour)?.[1]);
}

async function readGlass(
	page: Page,
	id: string,
): Promise<{ edge: string; fill: number; inner: number; outer: number; text: number }> {
	const glass = await page.locator(id).evaluate((element) => {
		const style = getComputedStyle(element);

		return {
			edge: style.borderTopWidth,
			fill: style.backgroundColor,
			inner: element.clientWidth,
			outer: (element as HTMLElement).offsetWidth,
			text: style.color,
		};
	});

	return { ...glass, fill: lightness(glass.fill), text: lightness(glass.text) };
}

test('a bare cap with no legend draws a faint edge in the text colour, which a legend, a cap or an edge takes away', async ({
	page,
}) => {
	const blank = await readEdge(page.locator('#bare-blank .sonic-button'));
	const ledOnly = await readEdge(page.locator('#bare-led-only .sonic-button'));
	const legend = await readEdge(page.locator('#bare-legend .sonic-button'));

	expect(blank.edge).toBe(blank.faint);
	expect(ledOnly.edge).toBe(ledOnly.faint);
	expect(legend.edge).toMatch(clear);

	for (const id of ['amber', 'flat', 'edged']) {
		const { edge } = await readEdge(page.locator(`#${id}-blank .sonic-button`));

		expect(edge, id).toMatch(clear);
	}
});

test('the edge follows a legend added or removed later, and lights at full strength once latched', async ({
	page,
}) => {
	const host = page.locator('#bare-blank');
	const button = host.locator('.sonic-button');
	const rest = await readEdge(button);

	await host.evaluate((element) => {
		const legend = document.createElement('span');

		legend.textContent = 'M';
		element.append(legend);
	});
	await expect
		.poll(async () => readEdge(button))
		.toMatchObject({ edge: expect.stringMatching(clear) });
	await expect(button.locator('.sonic-button-cap > span')).toHaveText('M');

	await button.locator('.sonic-button-cap > span').evaluate((legend) => {
		legend.remove();
	});

	await expect.poll(() => isEdged(button, 'faint')).toBe(true);

	await button.click();
	await page.mouse.move(0, 0);
	await expect(button).toHaveAttribute('aria-pressed', 'true');
	await expect.poll(() => isEdged(button, 'text')).toBe(true);

	const latched = await readEdge(button);

	expect(latched.text).not.toBe(rest.text);
});

test('a bare unlit LED is a tint of the text around it with no bezel, and a skinned one keeps its glass', async ({
	page,
}) => {
	const bare = await readLed(page, '#bare-led');
	const amber = await readLed(page, '#amber-led');

	expect(bare.lens).toBe(bare.tint);
	expect(bare.bezel).toMatch(clear);
	expect(bare.inset).toBe('2px');

	expect(amber.lens).toBe(amber.glass);
	expect(amber.bezel).not.toMatch(clear);
	expect(amber.inset).toBe('3.75px');
});

test('bare glass has an edge and follows the colour scheme, and skinned glass does neither', async ({
	page,
}) => {
	await page.emulateMedia({ colorScheme: 'light' });

	const light = await readGlass(page, '#bare-screen');
	const amberLight = await readGlass(page, '#amber-screen');
	const flat = await readGlass(page, '#flat-screen');
	const own = await readGlass(page, '#own-glass');

	expect(light.edge).toBe('1px');
	expect(amberLight.edge).toBe('0px');
	expect(amberLight.inner).toBe(amberLight.outer);
	expect(flat.edge).toBe('1px');
	expect(light.outer).toBe(amberLight.outer);

	expect(light.fill).toBeGreaterThan(0.9);
	expect(light.text).toBeLessThan(0.3);
	expect(own.text).toBeGreaterThan(0.7);

	await page.emulateMedia({ colorScheme: 'dark' });

	const dark = await readGlass(page, '#bare-screen');

	expect(dark.fill).toBeLessThan(0.2);
	expect(dark.text).toBeGreaterThan(0.7);
	expect(await readGlass(page, '#amber-screen')).toEqual(amberLight);
	expect(amberLight.fill).toBeLessThan(0.2);
	expect(amberLight.text).toBeGreaterThan(0.7);
});
