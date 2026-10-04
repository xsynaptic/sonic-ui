import { expect, test } from '@playwright/test';

import { collectConsole } from './console-messages.ts';

const fixtures = [
	['registered after load', '/fixtures/late/'],
	['in a React island that registers from an effect', '/fixtures/island/'],
] as const;

for (const [name, path] of fixtures) {
	test(`a dial ${name} takes its markup value and steps from it`, async ({ page }) => {
		const messages = collectConsole(page);

		await page.goto(path);

		const dial = page.getByRole('slider', { name: 'Cutoff' });

		await expect(dial).toHaveAttribute('aria-valuenow', '40');
		await expect(dial).toHaveAttribute('aria-valuemin', '10');
		await expect(dial).toHaveAttribute('aria-valuemax', '90');

		await dial.press('ArrowUp');
		await expect(dial).toHaveAttribute('aria-valuenow', '45');
		await expect(page.locator('sonic-dial')).toHaveJSProperty('value', 45);

		expect(messages).toEqual([]);
	});
}
