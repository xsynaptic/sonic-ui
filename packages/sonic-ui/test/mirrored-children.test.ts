import { expect, test, vi } from 'vitest';

import '#define/button.ts';
import '#define/dial.ts';

import { nextTask } from './helpers.ts';

function mirrorWarnings(warn: { mock: { calls: Array<Array<unknown>> } }): Array<string> {
	return warn.mock.calls
		.map(([message]) => String(message))
		.filter((message) => message.includes('copies its children'));
}

// The warning fires once per class, so the quiet cases run before the one that spends it
test('a button holding an icon and text stays quiet', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.body.innerHTML = '<sonic-button><svg><path d="M0 0h8"></path></svg>Play</sonic-button>';
	await nextTask();

	expect(document.querySelector('.sonic-button-cap svg')).not.toBeNull();
	expect(mirrorWarnings(warn)).toEqual([]);
	warn.mockRestore();
});

test('a link in a dial child that is not a scale mark stays quiet', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.body.innerHTML =
		'<sonic-dial><span><a href="#help">Help</a></span><span data-sonic-value="50">Mid</span></sonic-dial>';
	await nextTask();

	expect(document.querySelectorAll('sonic-dial a')).toHaveLength(1);
	expect(mirrorWarnings(warn)).toEqual([]);
	warn.mockRestore();
});

test('a link inside a button warns once across two instances, naming both tags', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();
	const button = '<sonic-button><span><a href="#more">More</a></span></sonic-button>';

	document.body.innerHTML = button + button;
	await nextTask();

	const messages = mirrorWarnings(warn);

	expect(messages).toHaveLength(1);
	expect(messages[0]).toContain('<sonic-button>');
	expect(messages[0]).toContain('<a>');
	warn.mockRestore();
});
