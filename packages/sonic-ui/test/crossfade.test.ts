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
