import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { collectConsole } from './console-messages.ts';

const broken = [
	'button',
	'dial',
	'envelope',
	'number',
	'segmented',
	'slider',
	'switch',
	'toggle',
	'waveform',
	'wavestrip',
	'xy',
];

async function readFacts(page: Page, reset: string): Promise<Record<string, string>> {
	await page.goto(`/fixtures/reset/?reset=${reset}`);

	return page.locator('#controls').evaluate(async (root) => {
		await document.fonts.ready;
		await new Promise((resolve) => {
			requestAnimationFrame(() => requestAnimationFrame(resolve));
		});

		const facts: Record<string, string> = {};
		const properties = [
			'padding-top',
			'padding-left',
			'margin-top',
			'margin-bottom',
			'margin-left',
			'border-top-width',
			'font-size',
			'color',
			'background-image',
		];

		function readPart(name: string, part: Element, origin: DOMRect): void {
			const box = part.getBoundingClientRect();
			const style = getComputedStyle(part);

			if (box.width > 0 && box.height > 0) {
				facts[`${name} box`] = [box.x - origin.x, box.y - origin.y, box.width, box.height]
					.map((edge) => edge.toFixed(1))
					.join(' ');
			}
			for (const property of properties) {
				facts[`${name} ${property}`] = style.getPropertyValue(property);
			}
		}

		for (const host of root.children) {
			const control = host.matches('[class^="sonic-"]')
				? host
				: host.querySelector('[class^="sonic-"]');
			if (!control) throw new Error(`#${host.id} drew no control`);

			const origin = control.getBoundingClientRect();

			for (const [index, part] of [control, ...control.querySelectorAll('*')].entries()) {
				readPart(
					`${host.id} ${String(index)} ${part.getAttribute('class') ?? part.localName}`,
					part,
					origin,
				);
			}
		}

		return facts;
	});
}

test(
	'a reset in a layer declared before sonic moves and recolours no part of any control',
	{ tag: '@mobile' },
	async ({ page }) => {
		const messages = collectConsole(page);
		const bare = await readFacts(page, 'none');
		const layered = await readFacts(page, 'layered');

		expect(Object.keys(bare).length).toBeGreaterThan(500);
		expect(
			Object.keys(bare)
				.filter((fact) => bare[fact] !== layered[fact])
				.map((fact) => `${fact}: ${String(bare[fact])} -> ${String(layered[fact])}`),
		).toEqual([]);
		expect(messages).toEqual([]);
	},
);

test('an unlayered reset zeroes the sheets’ padding, and each control it breaks says so once', async ({
	page,
}) => {
	const messages = collectConsole(page);
	const unlayered = await readFacts(page, 'unlayered');

	expect(unlayered['number 0 sonic-number padding-left']).toBe('0px');
	expect(messages.toSorted((first, second) => first.localeCompare(second))).toEqual(
		broken.map((control) => expect.stringContaining(`<sonic-${control}> has lost its `)),
	);
});

test('a margin on a host is reported, since the host has no box', async ({ page }) => {
	const messages = collectConsole(page);

	await page.goto('/fixtures/reset/?reset=none');
	await page.locator('#controls').evaluate((root) => {
		root.insertAdjacentHTML(
			'beforeend',
			'<sonic-meter max="0" min="-60" style="margin-inline-start: 4px"></sonic-meter>',
		);
	});

	await expect
		.poll(() => messages)
		.toEqual([expect.stringContaining('<sonic-meter> is display: contents and has no box')]);
});

test('a display on a host is reported, since the host has to stay display: contents', async ({
	page,
}) => {
	const messages = collectConsole(page);

	await page.goto('/fixtures/reset/?reset=none');
	await page.locator('#controls').evaluate((root) => {
		root.insertAdjacentHTML(
			'beforeend',
			'<sonic-meter max="0" min="-60" style="display: block"></sonic-meter>',
		);
	});

	await expect
		.poll(() => messages)
		.toEqual([expect.stringContaining('<sonic-meter> is given a display')]);
});
