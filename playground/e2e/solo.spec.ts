import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { solos } from '../src/scripts/solos.ts';
import { collectConsole } from './console-messages.ts';

const stylesFolder = path.join(import.meta.dirname, '../../packages/sonic-ui/dist/styles');

async function readEverySheet(): Promise<string> {
	const index = await readFile(path.join(stylesFolder, 'controls.css'), 'utf8');
	const files = [...index.matchAll(/@import '\.\/(.+?)';/g)].map(([, file = '']) => file);
	const sheets = await Promise.all(
		files.map((file) => readFile(path.join(stylesFolder, file), 'utf8')),
	);

	return sheets.join('\n');
}

function readPaint(page: Page): Promise<Record<string, string>> {
	return page.locator('#solo').evaluate(async (solo) => {
		await new Promise((resolve) => {
			requestAnimationFrame(() => requestAnimationFrame(resolve));
		});

		const paint: Record<string, string> = {};
		const parts = [...solo.querySelectorAll('*')].flatMap((element, index) =>
			['', '::before', '::after'].map((pseudo) => ({
				name: `${String(index)} ${element.localName}.${element.classList.value}${pseudo}`,
				styles: getComputedStyle(element, pseudo),
			})),
		);

		for (const { name, styles } of parts) {
			for (const property of styles) {
				if (!property.startsWith('--'))
					paint[`${name} ${property}`] = styles.getPropertyValue(property);
			}
		}

		return paint;
	});
}

const warnings = [
	{ path: '/fixtures/bare/', warning: 'material.css' },
	...Object.entries(solos).flatMap(([solo, { warns }]) =>
		warns === undefined
			? []
			: [
					{
						path: `/fixtures/solo/${solo}/`,
						warning: ` draws blank without @xsynaptic/sonic-ui/${warns} (or controls.css)`,
					},
				],
	),
];

test('a control without the material, or without a sheet its markup needs, warns once and names it', async ({
	page,
}) => {
	const messages = collectConsole(page);

	for (const { path, warning } of warnings) {
		messages.length = 0;
		await page.goto(path);

		await expect.poll(() => messages, path).toEqual([expect.stringContaining(warning)]);
	}
});

for (const [solo, { warns }] of Object.entries(solos)) {
	if (warns !== undefined) continue;

	test(`${solo} paints with the material and its own sheet alone`, async ({ page }) => {
		const messages = collectConsole(page);

		await page.goto(`/fixtures/solo/${solo}/`);
		await expect(
			page.locator('#solo [class^="sonic-"]').filter({ visible: true }).first(),
		).toBeVisible();

		const alone = await readPaint(page);

		await page.addStyleTag({ content: await readEverySheet() });

		const whole = await readPaint(page);
		const changed = Object.keys(whole).filter((key) => whole[key] !== alone[key]);

		expect(changed.map((key) => `${key}: ${String(alone[key])} -> ${String(whole[key])}`)).toEqual(
			[],
		);
		expect(messages).toEqual([]);
	});
}
