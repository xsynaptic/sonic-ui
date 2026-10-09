import { expect, test, vi } from 'vitest';

// Imports the built entry points, since tsdown drops a side-effect import unless `sideEffects` lists its source
test('the define entry points register their tags', async () => {
	// @ts-expect-error -- declarations ship in the development tree only
	await import('../dist/default/define/dial.js');

	expect(customElements.get('sonic-dial')).toBeDefined();
	expect(customElements.get('sonic-button')).toBeUndefined();

	// @ts-expect-error -- declarations ship in the development tree only
	await import('../dist/default/define.js');

	for (const tag of [
		'sonic-dial',
		'sonic-envelope',
		'sonic-button',
		'sonic-switch',
		'sonic-toggle',
		'sonic-meter',
		'sonic-number',
		'sonic-region',
		'sonic-segmented',
		'sonic-slider',
		'sonic-spectrum',
		'sonic-split',
		'sonic-waveform',
		'sonic-wavestrip',
		'sonic-xy',
	]) {
		expect(customElements.get(tag), tag).toBeDefined();
	}
});

test('the default tree leaves out the missing-sheet warning', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	// @ts-expect-error -- declarations ship in the development tree only
	await import('../dist/default/define.js');
	document.body.innerHTML = '<sonic-button></sonic-button>';
	await new Promise((resolve) => requestAnimationFrame(resolve));

	expect(warn).not.toHaveBeenCalled();
	warn.mockRestore();
});
