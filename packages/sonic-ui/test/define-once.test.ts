import { afterEach, expect, test, vi } from 'vitest';

import { defineOnce } from '#elements/define-once.ts';

afterEach(() => {
	vi.restoreAllMocks();
});

test('defining the same class twice stays silent', () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();
	class Same extends HTMLElement {}

	defineOnce('sonic-test-same', Same);
	defineOnce('sonic-test-same', Same);

	expect(customElements.get('sonic-test-same')).toBe(Same);
	expect(warn).not.toHaveBeenCalled();
});

test('a second copy of a class keeps the first registration and warns', () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();
	class First extends HTMLElement {}
	class Second extends HTMLElement {}

	defineOnce('sonic-test-copy', First);
	defineOnce('sonic-test-copy', Second);

	expect(customElements.get('sonic-test-copy')).toBe(First);
	expect(warn).toHaveBeenCalledOnce();
	expect(warn.mock.calls[0]?.[0]).toContain('<sonic-test-copy>');
});
