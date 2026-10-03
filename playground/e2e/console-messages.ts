import type { Page } from '@playwright/test';

export function collectConsole(page: Page): Array<string> {
	const messages: Array<string> = [];

	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') messages.push(message.text());
	});
	page.on('pageerror', (error) => {
		messages.push(error.message);
	});

	return messages;
}
