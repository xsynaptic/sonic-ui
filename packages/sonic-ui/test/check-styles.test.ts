import { expect, test, vi } from 'vitest';

import '#define/button.ts';
import '#define/dial.ts';
import '#define/meter.ts';
import '#define/number.ts';
import '#define/segmented.ts';
import '#define/slider.ts';

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
		'material/core.css and @xsynaptic/sonic-ui/material/cap.css',
	);
	expect(warn.mock.calls[0]?.[0]).toContain('material/arc.css and @xsynaptic/sonic-ui/dial.css');
	warn.mockRestore();
});

const sliderTokens =
	'--_sonic-unit: 1px; --_sonic-unlit: #000; --_sonic-cap: #000; --_sonic-readout-size: 1px; --_sonic-detent-zone: 1px;';
const readoutTokens =
	'sonic-slider { display: contents; } .sonic-slider-readout { --_sonic-glass-slab: #000; margin-bottom: 6px; } .sonic-slider-scale { position: absolute; }';

test('a styled control stays quiet', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.head.innerHTML = `<style>.sonic-slider { ${sliderTokens} --_sonic-groove: none; } ${readoutTokens}</style>`;
	document.body.innerHTML = '<sonic-slider></sonic-slider>';
	await nextFrame();

	expect(warn).not.toHaveBeenCalled();
	warn.mockRestore();
});

test('a control missing one material sheet names that sheet alone', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.head.innerHTML = `<style>.sonic-meter { --_sonic-unit: 1px; --_sonic-unlit: #000; --_sonic-lens: #000; }</style>`;
	document.body.innerHTML = '<sonic-meter></sonic-meter>';
	await nextFrame();

	expect(warn.mock.calls).toEqual([
		['<sonic-meter> draws blank without @xsynaptic/sonic-ui/material/groove.css (or controls.css)'],
	]);
	warn.mockRestore();
});

const numberTokens =
	'--_sonic-unit: 1px; --_sonic-unlit: #000; --_sonic-cap: #000; --_sonic-glass-slab: #000; --_sonic-glass-pitch: 2px; --_sonic-well-depth: 1; --_sonic-detent-zone: 1px;';

test('a box property on the host is named once, since the host has no box', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.head.innerHTML = `<style>sonic-number { display: contents; margin-top: 4px; } .sonic-number { ${numberTokens} --_sonic-number-inset-ratio: 0.2; padding-inline-start: 5px; }</style>`;
	document.body.innerHTML = '<sonic-number></sonic-number><sonic-number></sonic-number>';
	await nextFrame();

	expect(warn.mock.calls).toEqual([[expect.stringContaining('so its margin-top does nothing')]]);
	warn.mockRestore();
});

const keycapTokens =
	'--_sonic-unit: 1px; --_sonic-unlit: #000; --_sonic-cap: #000; --_sonic-well-depth: 1; --_sonic-well-floor: #000;';

test('a padding the host zeroed is reported, and one the control zeroed by its own ratio is not', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.head.innerHTML = `<style>
		sonic-button, sonic-segmented { display: contents; }
		.sonic-button { ${keycapTokens} --_sonic-button-padding-ratio: 0.25; }
		.sonic-segmented { ${keycapTokens} --_sonic-segmented-padding-ratio: 0; }
		.sonic-segmented-option { --_sonic-cap: #000; }
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
