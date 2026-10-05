import { expect, test } from 'vitest';

import { crossfadeGains } from '#lib/crossfade.ts';

test('the power law at a quarter keeps the summed power at 1, louder on the a side', () => {
	const { a, b } = crossfadeGains(0.25);

	expect(a).toBeCloseTo(0.9239, 4);
	expect(b).toBeCloseTo(0.3827, 4);
	expect(a ** 2 + b ** 2).toBeCloseTo(1, 10);
});

test.each([
	['linear', { a: 0.5, b: 1 }],
	['power', { a: Math.SQRT1_2, b: 1 }],
] as const)('%s at sharpness 0.5 and three quarters reaches full b early', (law, expected) => {
	const { a, b } = crossfadeGains(0.75, { law, sharpness: 0.5 });

	expect(a).toBeCloseTo(expected.a, 4);
	expect(b).toBeCloseTo(expected.b, 4);
});

test.each([
	[0.999, { a: 1, b: 1 }],
	[1, { a: 0, b: 1 }],
	[0, { a: 1, b: 0 }],
])('at sharpness 1, position %d cuts only at the far end', (position, expected) => {
	expect(crossfadeGains(position, { sharpness: 1 })).toEqual(expected);
});

test('positions past either end read as the end', () => {
	expect(crossfadeGains(-0.2, { law: 'linear' })).toEqual({ a: 1, b: 0 });
	expect(crossfadeGains(1.4, { law: 'linear' })).toEqual({ a: 0, b: 1 });
});

test.each([
	['power', Math.SQRT1_2],
	['linear', 0.5],
] as const)('the %s law at the center gives each side %d', (law, gain) => {
	const { a, b } = crossfadeGains(0.5, { law });

	expect(a).toBeCloseTo(gain, 12);
	expect(b).toBeCloseTo(gain, 12);
});

test('the power law is silent at the far end, not nearly silent', () => {
	expect(crossfadeGains(1)).toEqual({ a: 0, b: 1 });
	expect(crossfadeGains(0)).toEqual({ a: 1, b: 0 });
});

test('a mirrored position swaps the gains', () => {
	const options = { law: 'linear', sharpness: 0.25 } as const;

	expect(crossfadeGains(0.3, options).a).toBeCloseTo(crossfadeGains(0.7, options).b, 12);
	expect(crossfadeGains(0.5, options).a).toBeCloseTo(2 / 3, 12);
});
