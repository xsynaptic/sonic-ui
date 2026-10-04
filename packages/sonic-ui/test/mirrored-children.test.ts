import { expect, test, vi } from 'vitest';

import '#define/button.ts';
import '#define/dial.ts';
import '#define/meter.ts';
import '#define/number.ts';
import '#define/segmented.ts';

import { nextTask } from './helpers.ts';

function mirrorWarnings(warn: { mock: { calls: Array<Array<unknown>> } }): Array<string> {
	return warn.mock.calls
		.map(([message]) => String(message))
		.filter((message) => message.includes('copies its children'));
}

function childWarnings(warn: { mock: { calls: Array<Array<unknown>> } }): Array<string> {
	return warn.mock.calls
		.map(([message]) => String(message))
		.filter((message) => message.includes('only the children it documents'));
}

// Each warning fires once per class, so the quiet cases run before the one that spends it
test('a button holding an icon and text stays quiet', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.body.innerHTML = '<sonic-button><svg><path d="M0 0h8"></path></svg>Play</sonic-button>';
	await nextTask();

	expect(document.querySelector('.sonic-button-cap svg')).not.toBeNull();
	expect(mirrorWarnings(warn)).toEqual([]);
	warn.mockRestore();
});

test('blank text, comments, scale marks and an LED on a dial stay quiet', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.body.innerHTML = `
		<sonic-dial>
			<!-- the scale -->
			<span class="sonic-led"></span>
			<span data-sonic-value="50">Mid</span>
		</sonic-dial>
		<sonic-meter>
			<!-- nothing -->
		</sonic-meter>
	`;
	await nextTask();

	expect(childWarnings(warn)).toEqual([]);
	warn.mockRestore();
});

test('a link in a dial child that is not a scale mark is reported as undocumented, not as mirrored', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.body.innerHTML =
		'<sonic-dial><span><a href="#help">Help</a></span><span data-sonic-value="50">Mid</span></sonic-dial>';
	await nextTask();

	expect(document.querySelectorAll('sonic-dial a')).toHaveLength(1);
	expect(mirrorWarnings(warn)).toEqual([]);
	expect(childWarnings(warn)).toEqual([
		'<sonic-dial> uses only the children it documents, so the <span> inside it is unsupported',
	]);
	warn.mockRestore();
});

test('an LED on a segmented control warns, since only a dial or slider documents one', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.body.innerHTML =
		'<sonic-segmented><span data-sonic-value="a">A</span><span class="sonic-led"></span></sonic-segmented>';
	await nextTask();

	expect(childWarnings(warn)).toHaveLength(1);
	expect(childWarnings(warn)[0]).toContain('<sonic-segmented>');
	warn.mockRestore();
});

test('text inside a meter warns once across two instances', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.body.innerHTML = '<sonic-meter>Level</sonic-meter><sonic-meter>Level</sonic-meter>';
	await nextTask();

	expect(childWarnings(warn)).toEqual([
		'<sonic-meter> uses only the children it documents, so the text inside it is unsupported',
	]);
	warn.mockRestore();
});

test('a child appended to a number box after it connects warns', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.body.innerHTML = '<sonic-number></sonic-number>';
	await nextTask();
	expect(childWarnings(warn)).toEqual([]);

	document.querySelector('sonic-number')?.append(document.createElement('label'));
	await nextTask();

	expect(childWarnings(warn)).toHaveLength(1);
	expect(childWarnings(warn)[0]).toContain('<label>');
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
