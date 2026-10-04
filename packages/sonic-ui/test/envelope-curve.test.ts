import { expect, test } from 'vitest';

import { envelopeCurve } from '#lib/envelope-curve.ts';

test('a positive curve starts slowly, and its negative mirrors it about the diagonal', () => {
	expect(envelopeCurve(0.5, 4)).toBeCloseTo(0.1192, 4);
	expect(envelopeCurve(0.5, -4)).toBeCloseTo(0.8808, 4);
	expect(envelopeCurve(0.25, 4) + envelopeCurve(0.75, -4)).toBeCloseTo(1, 10);
});

test.each([-8, -0.5, 0, 0.0005, 3])('a curve of %d still runs from 0 to 1', (curve) => {
	expect(envelopeCurve(0, curve)).toBe(0);
	expect(envelopeCurve(1, curve)).toBe(1);
});

test('no curve is the identity, with no division by zero', () => {
	expect(envelopeCurve(0.3, 0)).toBe(0.3);
	expect(envelopeCurve(0.3, 0.0005)).toBe(0.3);
});
