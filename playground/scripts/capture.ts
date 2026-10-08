import type { Browser, Page } from '@playwright/test';

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

interface Look {
	scheme: string;
	skin: string;
}

interface Shot {
	look?: Look;
	path: string;
	scale: number;
	viewport: { height: number; width: number };
}

const port = 4332;
const origin = `http://localhost:${String(port)}`;
const assets = new URL('../../.github/assets/', import.meta.url).pathname;
const social = new URL('../public/', import.meta.url).pathname;
const schemes = ['light', 'dark'];
const desktop = { height: 900, width: 1280 };

async function isUp(url: string): Promise<boolean> {
	try {
		const response = await fetch(url);

		return response.ok;
	} catch {
		return false;
	}
}

async function waitFor(url: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (await isUp(url)) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`The preview never answered at ${url}`);
}

async function open(browser: Browser, { look, path, scale, viewport }: Shot): Promise<Page> {
	const context = await browser.newContext({ deviceScaleFactor: scale, viewport });

	if (look) {
		await context.addInitScript(({ scheme, skin }) => {
			localStorage.setItem('sonic-playground-skin', skin);
			localStorage.setItem('sonic-playground-scheme', scheme);
		}, look);
	}

	const page = await context.newPage();

	await page.goto(`${origin}${path}`);
	await page.evaluate(async () => {
		await customElements.whenDefined('sonic-dial');
		await document.fonts.ready;
	});

	return page;
}

// Transparent corners, so the image sits on any page colour
async function clear(page: Page, selector: string): Promise<void> {
	await page.evaluate((grounds) => {
		for (const ground of document.querySelectorAll<HTMLElement>(grounds)) {
			ground.style.background = 'transparent';
			ground.style.borderColor = 'transparent';
		}
	}, selector);
}

// Times out when the browser runs no audio; launch headed if it does
async function play(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Play' }).click();
	await page.mouse.move(0, 0);
	await page.waitForFunction(() => {
		const meter = document.querySelector<HTMLElement & { level: number }>(
			'[data-echo-meter="output"]',
		);

		return meter !== null && meter.level > 0;
	});
	await page.waitForTimeout(2000);
}

async function captureWordmarks(browser: Browser): Promise<void> {
	const page = await open(browser, { path: '/fixtures/wordmark/', scale: 4, viewport: desktop });

	await clear(page, '[data-ground]');
	for (const scheme of schemes) {
		await page
			.locator(`[data-wordmark="${scheme}"]`)
			.screenshot({ omitBackground: true, path: `${assets}wordmark-${scheme}.png` });
	}
	await page.context().close();
}

async function captureHeroes(browser: Browser): Promise<void> {
	for (const scheme of schemes) {
		const page = await open(browser, {
			look: { scheme, skin: 'amber' },
			path: '/tape-echo/',
			scale: 2,
			viewport: desktop,
		});

		await clear(page, 'body');
		await play(page);
		await page
			.locator('[data-tape-echo] > .surface')
			.screenshot({ omitBackground: true, path: `${assets}hero-${scheme}.png` });
		await page.context().close();
	}
}

async function captureSocial(browser: Browser): Promise<void> {
	const page = await open(browser, {
		path: '/fixtures/og/',
		scale: 1,
		viewport: { height: 640, width: 1280 },
	});

	await play(page);
	await page.screenshot({ path: `${social}og.png` });
	await page.context().close();
}

// Astro daemonizes preview when it detects an agent; a foreground child is one this script can stop
const preview = spawn('astro', ['preview', '--port', String(port), '--ignore-lock'], {
	env: { ...process.env, ASTRO_PREVIEW_BACKGROUND: '0' },
	stdio: 'ignore',
});

try {
	await waitFor(`${origin}/fixtures/wordmark/`);
	await mkdir(assets, { recursive: true });
	await mkdir(social, { recursive: true });

	const browser = await chromium.launch();

	await captureWordmarks(browser);
	await captureHeroes(browser);
	await captureSocial(browser);
	await browser.close();
} finally {
	preview.kill();
}
