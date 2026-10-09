import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { expectRuns, paintedLine, paintedRuns } from './paint-probe.ts';
import { mouseOnly } from './pointer.ts';
import { stillTransitions } from './state.ts';

interface DiscSizes {
	gap: number;
	ring: number;
}

const points = [
	'#envelope .sonic-envelope-handle[data-sonic-stage="decay"]',
	'#envelope-curves .sonic-envelope-curve[data-sonic-stage="decay"]',
];

function isClear(paint: string): boolean {
	return /^(?:rgba?|oklab)\([^)]*[,/] ?0\)/.test(paint);
}

type Colour = [number, number, number];

function differsFrom(backdrop: Colour | undefined): (colour: Colour) => boolean {
	return (colour) =>
		colour.some((channel, index) => Math.abs(channel - (backdrop?.[index] ?? 0)) > 15);
}

// Enlarged through its size token: at 8rem the ring, its gap and the lines are a pixel or two wide
async function openLargePad(page: Page): Promise<{ disc: DiscSizes; puck: Locator }> {
	await page.goto('/fixtures/');
	await stillTransitions(page);
	await page.locator('#xy').evaluate((pad) => {
		pad.style.setProperty('--sonic-xy-size', '16rem');
		pad.style.setProperty('--sonic-relief', '0');
	});

	const puck = page.locator('#xy .sonic-xy-puck');
	const [gap = 0, ring = 0] = await puck.evaluate((element) => {
		const style = getComputedStyle(element, '::before');

		return [style.outlineOffset, style.outlineWidth].map((length) =>
			Number(length.replace('px', '')),
		);
	});

	return { disc: { gap, ring }, puck };
}

test('a handle and a curve handle brighten on hover and keep their ring while held', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	await page.goto('/fixtures/');
	await stillTransitions(page);

	for (const selector of points) {
		const point = page.locator(selector);
		const read = () =>
			point.evaluate((element) => {
				const style = getComputedStyle(element);

				return { core: style.backgroundColor, ring: style.borderTopColor };
			});
		const rest = await read();

		await point.hover();

		const hovered = await read();

		await page.mouse.down();

		const held = await read();

		await page.mouse.up();
		expect.soft(rest.core, selector).toBe(rest.ring);
		expect.soft(hovered.ring, selector).not.toBe(rest.ring);
		expect.soft(hovered.core, selector).toBe(hovered.ring);
		expect.soft(held.ring, selector).toBe(rest.ring);
		expect.soft(held.core, selector).toBe(held.ring);
	}
});

test('a held handle keeps its core, and a relief skin gives it a glow, not a reticle', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	await page.goto('/fixtures/');
	await stillTransitions(page);

	const handle = page.locator(points[0] ?? '');
	const read = () =>
		handle.evaluate((element) => {
			const style = getComputedStyle(element);
			const reticle = element.parentElement?.querySelector('.sonic-envelope-reticle');

			return {
				halo: style.boxShadow,
				reticle: reticle ? getComputedStyle(reticle, '::before').opacity : '',
			};
		});

	await handle.hover();
	await page.mouse.down();

	const held = await read();

	await page.mouse.up();
	await handle.evaluate((element) => {
		element.closest<HTMLElement>('sonic-envelope')?.style.setProperty('--sonic-relief', '0');
	});
	await handle.hover();
	await page.mouse.down();

	const heldFlat = await read();

	await page.mouse.up();
	expect(isClear(held.halo)).toBe(false);
	expect(held.reticle).toBe('0');
	expect(isClear(heldFlat.halo)).toBe(true);
	expect(heldFlat.reticle).toBe('1');
});

test('the puck lifts on hover, and held it keeps its fill under a glow, or a reticle on a flat skin', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	await page.goto('/fixtures/');
	await stillTransitions(page);

	const puck = page.locator('#xy .sonic-xy-puck');
	const read = () =>
		puck.evaluate((element) => {
			const disc = getComputedStyle(element, '::before');
			const reticle = element.parentElement?.querySelector('.sonic-xy-reticle');

			return {
				edge: disc.borderTopColor,
				fill: disc.backgroundColor,
				glow: getComputedStyle(element).filter,
				reticle: reticle ? getComputedStyle(reticle).opacity : '',
			};
		});
	const rest = await read();

	await puck.hover();

	const hovered = await read();

	await page.mouse.down();

	const held = await read();

	await page.mouse.up();
	await page.locator('#xy').evaluate((pad) => {
		pad.style.setProperty('--sonic-relief', '0');
	});
	await puck.hover();
	await page.mouse.down();

	const heldFlat = await read();

	await page.mouse.up();
	expect(hovered.fill).not.toBe(rest.fill);
	expect(hovered.glow).toBe(rest.glow);
	expect(held.fill).toBe(rest.fill);
	expect(held.edge).toBe(rest.edge);
	expect(held.glow).not.toBe(rest.glow);
	expect(held.reticle).toBe('0');
	expect(heldFlat.fill).toBe(rest.fill);
	expect(heldFlat.reticle).toBe('1');
});

test(
	'a key-focused puck is ringed by a circle that stands clear of its disc',
	{ tag: '@mobile' },
	async ({ page }) => {
		const { disc, puck } = await openLargePad(page);

		await page.addStyleTag({ content: '#xy .sonic-xy-field { visibility: hidden; }' });
		await page.locator('#xy [data-sonic-axis="x"]').press('Shift');

		const across = await paintedLine(puck, 'x');
		const size = across.lengthPx;
		const runs = paintedRuns(across, differsFrom(across.pixels[0]));

		expect(disc.gap).toBeGreaterThanOrEqual(2);
		expectRuns(runs, [
			[size * 0.25 - disc.gap - disc.ring, size * 0.25 - disc.gap],
			[size * 0.25, size * 0.75],
			[size * 0.75 + disc.gap, size * 0.75 + disc.gap + disc.ring],
		]);

		// Through the top of the ring a circle is a short chord, where a square outline would span the disc
		const top = await paintedLine(puck, 'x', (size * 0.25 - disc.gap - disc.ring / 2) / size);
		const chords = paintedRuns(top, differsFrom(top.pixels[0])).map(([from, to]) => to - from);

		expect(chords).toHaveLength(1);
		expect(chords[0]).toBeLessThan(size / 2);
	},
);
