import type { Locator } from '@playwright/test';

import { expect, test } from '@playwright/test';

const controls = [
	{ control: '.sonic-dial', host: '#level', name: 'a dial', token: '--sonic-dial-size' },
	{
		control: '.sonic-button',
		host: '#power',
		name: 'a button holding an LED',
		token: '--sonic-button-size',
	},
	{ control: '.sonic-xy', host: '#xy', name: 'an XY pad', token: '--sonic-xy-size' },
	{
		control: '.sonic-envelope',
		host: '#envelope',
		name: 'an envelope',
		token: '--sonic-envelope-size',
	},
];

// A readout paints past the control's box, so it is not one of its parts
function readParts(control: Locator): Promise<Record<string, Array<number>>> {
	return control.evaluate((element) => {
		const origin = element.getBoundingClientRect();
		const parts: Record<string, Array<number>> = {};

		for (const [index, part] of [element, ...element.querySelectorAll('*')].entries()) {
			const box = part.getBoundingClientRect();
			if (part.closest('[popover]') || box.width === 0 || box.height === 0) continue;

			parts[`${String(index)} ${part.getAttribute('class') ?? part.localName}`] = [
				box.x - origin.x,
				box.y - origin.y,
				box.width,
				box.height,
			];
		}

		return parts;
	});
}

for (const { control, host, name, token } of controls) {
	test(`${name} scales as one piece when its size doubles`, async ({ page }) => {
		await page.goto('/fixtures/');

		const target = page.locator(`${host} ${control}`);

		await target.scrollIntoViewIfNeeded();

		const before = await readParts(target);
		const size = await target.evaluate(
			(element, name) => getComputedStyle(element).getPropertyValue(name),
			token.replace('--sonic', '--_sonic'),
		);

		expect(Object.keys(before).length).toBeGreaterThan(2);
		await page.locator(host).evaluate(
			(element: HTMLElement, [name, value]) => {
				element.style.setProperty(name, value);
			},
			[token, `calc(2 * ${size})`] as const,
		);

		await expect(async () => {
			const after = await readParts(target);

			for (const [part, box] of Object.entries(before)) {
				for (const [index, edge] of box.entries()) {
					const doubled = after[part]?.[index] ?? NaN;

					expect(Math.abs(doubled - 2 * edge), `${part} from ${String(box)}`).toBeLessThanOrEqual(
						1,
					);
				}
			}
		}).toPass();
	});
}
