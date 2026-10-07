import type { Page } from '@playwright/test';

export const clear = /^(transparent|rgba\(0, 0, 0, 0\))|\/ 0\)$/;

export async function systemColour(page: Page, colour: string): Promise<string> {
	return page.evaluate((expression) => {
		const probe = document.createElement('div');

		probe.style.cssText = `forced-color-adjust: none; background: ${expression}`;
		document.body.append(probe);

		const computed = getComputedStyle(probe).backgroundColor;

		probe.remove();

		return computed;
	}, colour);
}
