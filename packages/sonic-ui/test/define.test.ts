// @vitest-environment happy-dom
import { expect, test } from 'vitest';

// Imports the built entries, since tsdown drops a side-effect import unless `sideEffects` lists its source
test('the define entries register their tags', async () => {
	await import('../dist/define/dial.js');

	expect(customElements.get('sonic-dial')).toBeDefined();
	expect(customElements.get('sonic-key')).toBeUndefined();

	await import('../dist/define.js');

	for (const tag of ['sonic-dial', 'sonic-key', 'sonic-meter', 'sonic-segmented', 'sonic-slider']) {
		expect(customElements.get(tag), tag).toBeDefined();
	}
});
