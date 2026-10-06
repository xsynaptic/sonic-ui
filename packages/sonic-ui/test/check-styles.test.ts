import { expect, test, vi } from 'vitest';

import '#define/dial.ts';
import '#define/meter.ts';
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
const readoutTokens = '.sonic-slider-readout { --_sonic-glass-slab: #000; }';

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
