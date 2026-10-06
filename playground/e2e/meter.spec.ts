import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { expectEdge, paintedLine, paintedRuns } from './paint-probe.ts';

// One flat colour for every zone, so a lit pixel is told from a dim one whichever zone it sits in
const flatZones =
	'sonic-meter { --sonic-lit: #0f0; --sonic-lit-warning: #0f0; --sonic-lit-danger: #0f0; }';

test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: 0 });
	await page.goto('/fixtures/');
	await page.addStyleTag({ content: flatZones });
	await page.clock.pauseAt(60_000);
});

function isLit([red, green, blue]: [number, number, number]): boolean {
	return green > 150 && green - Math.max(red, blue) > 50;
}

// Measured from the end the bar grows from: the bottom, or the left when horizontal
async function litRuns(meter: Locator, axis: 'x' | 'y'): Promise<Array<[number, number]>> {
	const line = await paintedLine(meter.locator('.sonic-meter'), axis);
	const runs = paintedRuns(line, isLit);

	return axis === 'x'
		? runs
		: runs
				.map(([from, to]): [number, number] => [line.lengthPx - to, line.lengthPx - from])
				.toReversed();
}

async function setLevel(page: Page, meter: Locator, decibels: number): Promise<void> {
	await meter.evaluate(
		(element, amplitude) => {
			Object.assign(element, { level: amplitude });
		},
		10 ** (decibels / 20),
	);
	await page.clock.runFor(100);
}

function isUnlit(runs: Array<[number, number]>, [from, to]: [number, number]): boolean {
	return runs.every(([runFrom, runTo]) => runTo <= from || runFrom >= to);
}

// 30 segments of 4px over 60 dB, the first starting 1px in from the end
test('a level lights the bar to its decibels, then the bar falls away under the peak it holds', async ({
	page,
}) => {
	const meter = page.locator('#meter');

	await setLevel(page, meter, -30);

	const risen = await litRuns(meter, 'y');

	expectEdge(risen.at(0)?.[0], 1);
	expectEdge(risen.at(-1)?.[1], 60);
	expect(isUnlit(risen, [62, 128])).toBe(true);

	await meter.evaluate((element) => {
		Object.assign(element, { level: 0 });
	});
	await page.clock.runFor(750);

	const falling = await litRuns(meter, 'y');

	expectEdge(falling.at(-1)?.[1], 60);
	expect(isUnlit(falling, [34, 56])).toBe(true);
	expect(isUnlit(falling, [1, 28])).toBe(false);

	await page.clock.runFor(2500);
	expect(await litRuns(meter, 'y')).toEqual([]);
});

test('reaching 0 dBFS lights the clip lens, which goes out once its hold is over', async ({
	page,
}) => {
	const meter = page.locator('#meter');
	const lensRuns = async (): Promise<number> => {
		const line = await paintedLine(meter.locator('.sonic-meter-clip'), 'x');

		return paintedRuns(line, isLit).length;
	};

	expect(await lensRuns()).toBe(0);

	await setLevel(page, meter, 0);
	expect(await lensRuns()).toBe(1);

	await setLevel(page, meter, -30);
	await page.clock.runFor(1500);
	expect(await lensRuns()).toBe(0);
});

// Five segments 25.2px apart; a lens highlight can split one segment's light in two
test('a ladder lights one segment for each threshold the level has reached', async ({ page }) => {
	const ladder = page.locator('#ladder');

	await setLevel(page, ladder, -5);

	const runs = await litRuns(ladder, 'y');
	const lit = runs.map(([from, to]) => Math.floor((from + to) / 2 / 25.2));

	expect([...new Set(lit)]).toEqual([0, 1, 2]);
});

// 31 segments of 4px from -1 to 1, so the origin at 0 falls inside the segment from 61px to 65px
test('a value lights from the origin toward it, either way, and nothing at the origin itself', async ({
	page,
}) => {
	const correlation = page.locator('#correlation');
	const lightTo = async (value: number): Promise<Array<[number, number]>> => {
		await correlation.evaluate((element, next) => {
			Object.assign(element, { value: next });
		}, value);

		return litRuns(correlation, 'x');
	};

	expect(await litRuns(correlation, 'x')).toEqual([]);

	const above = await lightTo(0.5);

	expectEdge(above.at(0)?.[0], 65);
	expectEdge(above.at(-1)?.[1], 92);

	const below = await lightTo(-1);

	expectEdge(below.at(0)?.[0], 1);
	expectEdge(below.at(-1)?.[1], 60);
});

async function partBoxes(page: Page, id: string): Promise<{ meter: DOMRect; segments: DOMRect }> {
	return page.locator(`#${id}`).evaluate((element) => {
		const meter = element.querySelector('.sonic-meter')?.getBoundingClientRect();
		const segments = element.querySelector('.sonic-meter-segments')?.getBoundingClientRect();
		if (!meter || !segments) throw new Error('The meter did not render');

		return { meter: meter.toJSON() as DOMRect, segments: segments.toJSON() as DOMRect };
	});
}

test('a length of 100% fills the parent, draws the segments a fixed length does, and runs a horizontal ladder the same inset from both ends', async ({
	page,
}) => {
	const percent = await partBoxes(page, 'meter-percent');
	const fixed = await partBoxes(page, 'meter-fixed');
	const { meter, segments } = await partBoxes(page, 'ladder-percent');

	expect(percent.meter.height).toBeCloseTo(150, 1);
	expect(percent.segments.height).toBeCloseTo(fixed.segments.height, 1);
	expect(percent.segments.bottom).toBeCloseTo(fixed.segments.bottom, 1);

	expect(meter.width).toBeCloseTo(150, 1);
	expect(segments.left - meter.left).toBeGreaterThan(0);
	expect(meter.right - segments.right).toBeCloseTo(segments.left - meter.left, 1);
});
