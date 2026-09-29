import { expect, test, vi } from 'vitest';

import '#define/dial.ts';
import '#define/slider.ts';

function nextFrame(): Promise<number> {
	return new Promise((resolve) => requestAnimationFrame(resolve));
}

test('a control without its sheets warns once per class, naming both imports', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.body.innerHTML = '<sonic-dial></sonic-dial><sonic-dial></sonic-dial>';
	await nextFrame();
	document.body.innerHTML = '<sonic-dial></sonic-dial>';
	await nextFrame();

	expect(warn).toHaveBeenCalledOnce();
	expect(warn.mock.calls[0]?.[0]).toContain('material.css and @xsynaptic/sonic-ui/dial.css');
	warn.mockRestore();
});

test('a styled control stays quiet', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	document.head.innerHTML =
		'<style>.sonic-slider { --_sonic-unit: 1px; --_sonic-unlit: #000; }</style>';
	document.body.innerHTML = '<sonic-slider></sonic-slider>';
	await nextFrame();

	expect(warn).not.toHaveBeenCalled();
	warn.mockRestore();
});
