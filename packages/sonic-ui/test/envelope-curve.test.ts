import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';

import { envelopeCurve, envelopePosition } from '#lib/envelope-curve.ts';

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

test.prop(
	[
		fc.double({ max: 1, min: 0, noNaN: true }),
		fc.oneof(fc.double({ max: 20, min: -20, noNaN: true }), fc.constantFrom(0, 0.0005, -0.0009)),
	],
	{ numRuns: 2000 },
)(
	'the curve reaches each level at the position given for it, flat curves included',
	(level, curve) => {
		expect(envelopeCurve(envelopePosition(level, curve), curve)).toBeCloseTo(level, 9);
	},
);
