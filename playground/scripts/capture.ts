import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const port = 4332;
const origin = `http://localhost:${String(port)}`;
const assets = new URL('../../.github/assets/', import.meta.url).pathname;
const schemes = ['light', 'dark'];

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

// Astro daemonizes preview when it detects an agent; a foreground child is one this script can stop
const preview = spawn('astro', ['preview', '--port', String(port), '--ignore-lock'], {
	env: { ...process.env, ASTRO_PREVIEW_BACKGROUND: '0' },
	stdio: 'ignore',
});

try {
	await waitFor(`${origin}/fixtures/wordmark/`);
	await mkdir(assets, { recursive: true });

	const browser = await chromium.launch();
	const page = await browser.newPage({ deviceScaleFactor: 4 });

	await page.goto(`${origin}/fixtures/wordmark/`);
	await page.evaluate(async () => {
		await customElements.whenDefined('sonic-dial');
		await document.fonts.ready;
		for (const ground of document.querySelectorAll<HTMLElement>('[data-ground]')) {
			ground.style.background = 'transparent';
		}
	});
	for (const scheme of schemes) {
		await page
			.locator(`[data-wordmark="${scheme}"]`)
			.screenshot({ omitBackground: true, path: `${assets}wordmark-${scheme}.png` });
	}
	await browser.close();
} finally {
	preview.kill();
}
