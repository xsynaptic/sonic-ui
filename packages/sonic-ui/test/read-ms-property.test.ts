import { expect, test } from 'vitest';

import { readMsProperty } from '#lib/read-ms-property.ts';

function stylesOf(value: string): CSSStyleDeclaration {
	const element = document.createElement('div');

	element.style.setProperty('--_sonic-test-delay', value);

	return element.style;
}

test.each([
	['150ms', 150],
	['0.15s', 150],
	[' 2s', 2000],
	['0s', 0],
])('a computed time of %s reads as %d milliseconds', (value, expected) => {
	expect(readMsProperty(stylesOf(value), '--_sonic-test-delay', 250)).toBeCloseTo(expected, 9);
});

test('a property that holds no time falls back', () => {
	expect(readMsProperty(stylesOf(''), '--_sonic-test-delay', 250)).toBe(250);
});
