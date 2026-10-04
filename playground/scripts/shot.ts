import type { Browser, Page } from '@playwright/test';

import { chromium, firefox, webkit } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { pixelLine } from '../e2e/paint-probe.ts';

interface Tile {
	data: Buffer;
	label: string;
}

const engines = new Map(Object.entries({ chromium, firefox, webkit }));

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		css: { default: '', type: 'string' },
		dpr: { default: '2', type: 'string' },
		engine: { default: 'chromium', type: 'string' },
		out: { default: 'shot', type: 'string' },
		pad: { default: '8', type: 'string' },
		path: { default: '/', type: 'string' },
		pixels: { type: 'string' },
		scheme: { default: 'dark', type: 'string' },
		skin: { default: 'default', type: 'string' },
		state: { default: 'rest', type: 'string' },
		zoom: { default: '1', type: 'string' },
	},
});

const [selector] = positionals;
if (!selector) throw new Error('Usage: pnpm shot <selector> [--engine --skin --scheme --state]');

const { url } = JSON.parse(
	readFileSync(new URL('../.astro/dev.json', import.meta.url), 'utf8'),
) as { url: string };
const directory = new URL('../../node_modules/.cache/shots/', import.meta.url).pathname;
const pad = Number(values.pad);

async function open(browser: Browser, skin: string, scheme: string): Promise<Page> {
	const context = await browser.newContext({
		deviceScaleFactor: Number(values.dpr),
		viewport: { height: 900, width: 1280 },
	});

	await context.addInitScript(
		([skin, scheme]) => {
			localStorage.setItem('sonic-playground-skin', skin);
			localStorage.setItem('sonic-playground-scheme', scheme);
		},
		[skin, scheme] as const,
	);

	const page = await context.newPage();

	await page.goto(url + values.path);
	await page.addStyleTag({ content: `astro-dev-toolbar { display: none; } ${values.css}` });
	await page.evaluate(async () => {
		await document.fonts.ready;
	});

	return page;
}

async function capture(page: Page, target: string, label: string): Promise<Array<Tile>> {
	const part = page.locator(target).first();

	await part.scrollIntoViewIfNeeded();

	const box = await part.boundingBox();
	if (!box) throw new Error(`Nothing matches ${target}`);

	const clip = {
		height: box.height + 2 * pad,
		width: box.width + 2 * pad,
		x: box.x - pad,
		y: box.y - pad,
	};
	const tiles: Array<Tile> = [];

	for (const state of values.state.split(',')) {
		if (state !== 'rest') await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		if (state === 'held') await page.mouse.down();
		await page.waitForTimeout(300);
		tiles.push({ data: await page.screenshot({ clip }), label: `${label} ${state}` });
		await page.mouse.up();
		await page.mouse.move(0, 0);
	}

	return tiles;
}

function runs(pixels: Array<[number, number, number]>): string {
	const out: Array<string> = [];
	let count = 0;

	for (const [index, pixel] of pixels.entries()) {
		count += 1;
		if (String(pixel) === String(pixels[index + 1])) continue;

		out.push(`${String(count)}x ${pixel.join(',')}`);
		count = 0;
	}

	return (out.length > 24 ? [...out.slice(0, 12), '...', ...out.slice(-12)] : out).join(' | ');
}

async function montage(sheet: Page, tiles: Array<Tile>, columns: number): Promise<void> {
	const figures = tiles.map(
		({ data, label }) =>
			`<figure style="margin:0"><img src="data:image/png;base64,${data.toString('base64')}" style="display:block;image-rendering:pixelated;zoom:${values.zoom}"><figcaption>${label}</figcaption></figure>`,
	);

	await sheet.setContent(
		`<div id="grid" style="display:inline-grid;grid-template-columns:repeat(${String(columns)},auto);gap:6px;padding:6px;background:#f0f;color:#fff;font:10px monospace">${figures.join('')}</div>`,
	);

	const grid = sheet.locator('#grid');
	const { height, width } = await grid.evaluate((element) => {
		const box = element.getBoundingClientRect();

		element.style.zoom = String(Math.min(1, 2000 / Math.max(box.width, box.height)));

		return element.getBoundingClientRect();
	});
	const path = `${directory}${values.out}.png`;

	mkdirSync(directory, { recursive: true });
	await grid.screenshot({ path });
	console.log(
		`${path} ${String(Math.round(width))}x${String(Math.round(height))}, about ${String(Math.round((width * height) / 750))} tokens to read`,
	);
}

const tiles: Array<Tile> = [];
const names = values.engine.split(',');

for (const name of names) {
	const engine = engines.get(name);
	if (!engine) throw new Error(`No engine named ${name}`);

	const browser = await engine.launch();

	for (const skin of values.skin.split(',')) {
		for (const scheme of values.scheme.split(',')) {
			const page = await open(browser, skin, scheme);

			tiles.push(...(await capture(page, selector, `${name} ${skin} ${scheme}`)));
		}
	}

	await browser.close();
}

const tool = await chromium.launch();
const sheet = await tool.newPage();

if (values.pixels === 'x' || values.pixels === 'y') {
	for (const { data, label } of tiles) {
		console.log(`${label}: ${runs(await pixelLine(sheet, data, values.pixels))}`);
	}
} else {
	await montage(sheet, tiles, tiles.length / names.length);
}

await tool.close();
