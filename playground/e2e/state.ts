import type { Locator, Page } from '@playwright/test';

export function readState(host: Locator, name: string): Promise<boolean> {
	return host.evaluate((element, state) => element.matches(`:state(${state})`), name);
}

export async function valueNow(control: Locator): Promise<number> {
	return Number(await control.getAttribute('aria-valuenow'));
}

export async function stillTransitions(page: Page): Promise<void> {
	await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
}
