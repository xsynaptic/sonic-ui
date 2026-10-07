import { expect, test, vi } from 'vitest';

import '#define/button.ts';
import '#define/dial.ts';
import '#define/number.ts';
import '#define/segmented.ts';

function nextFrame(): Promise<number> {
	return new Promise((resolve) => requestAnimationFrame(resolve));
}

test('a control without its sheets warns once per class, naming each import', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.body.innerHTML = '<sonic-dial></sonic-dial><sonic-dial></sonic-dial>';
	await nextFrame();
	document.body.innerHTML = '<sonic-dial></sonic-dial>';
	await nextFrame();

	expect(warn).toHaveBeenCalledOnce();
	expect(warn.mock.calls[0]?.[0]).toContain(
		'@xsynaptic/sonic-ui/material/core.css and @xsynaptic/sonic-ui/dial.css (or controls.css)',
	);
	warn.mockRestore();
});

const sheetTokens = '--_sonic-unit: 1px; --_sonic-unlit: #000;';

test('a box property on the host is named once, since the host has no box', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.head.innerHTML = `<style>sonic-number { display: contents; margin-top: 4px; } .sonic-number { ${sheetTokens} --_sonic-number-inset-ratio: 0.2; padding-inline-start: 5px; }</style>`;
	document.body.innerHTML = '<sonic-number></sonic-number><sonic-number></sonic-number>';
	await nextFrame();

	expect(warn.mock.calls).toEqual([[expect.stringContaining('so its margin-top does nothing')]]);
	warn.mockRestore();
});

test('a padding the host zeroed is reported, and one the control zeroed by its own ratio is not', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.head.innerHTML = `<style>
		sonic-button, sonic-segmented { display: contents; }
		.sonic-button { ${sheetTokens} --_sonic-button-padding-ratio: 0.25; }
		.sonic-segmented { ${sheetTokens} --_sonic-segmented-padding-ratio: 0; }
		.sonic-button-cap > span, .sonic-segmented-cap { padding-inline-start: 0px; }
	</style>`;
	document.body.innerHTML =
		'<sonic-button><span>Tap</span></sonic-button><sonic-segmented value="a"><span data-sonic-value="a">A</span></sonic-segmented>';
	await nextFrame();

	expect(warn.mock.calls).toEqual([
		[expect.stringContaining('<sonic-button> has lost its padding-inline-start')],
	]);
	warn.mockRestore();
});
