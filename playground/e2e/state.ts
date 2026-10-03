import type { Locator } from '@playwright/test';

export function readState(host: Locator, name: string): Promise<boolean> {
	return host.evaluate((element, state) => element.matches(`:state(${state})`), name);
}
