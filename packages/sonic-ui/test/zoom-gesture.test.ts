import { expect, test } from 'vitest';

import { pinchFactor, wheelFactor, zoomKeyFactor } from '#lib/zoom-gesture.ts';

test('a wheel up by 10px zooms in by a tenth, and a line is 16px', () => {
	expect(wheelFactor(-10, 0)).toBeCloseTo(Math.exp(0.1), 12);
	expect(wheelFactor(-1, 1)).toBeCloseTo(Math.exp(0.16), 12);
});

test('a wheel notch is capped either way, and a key press undoes one', () => {
	expect(wheelFactor(120, 0)).toBeCloseTo(Math.exp(-0.25), 12);
	expect(wheelFactor(-3, 1)).toBeCloseTo(Math.exp(0.25), 12);
	expect(wheelFactor(120, 0) * zoomKeyFactor).toBeCloseTo(1, 12);
});

test('a pinch follows the ratio of the spans, whichever finger is on the left', () => {
	expect(pinchFactor(100, 150)).toBeCloseTo(1.5, 12);
	expect(pinchFactor(-100, 50)).toBeCloseTo(0.5, 12);
});

test('a span under 16px counts as 16px at either end of a pinch', () => {
	expect(pinchFactor(4, 64)).toBe(4);
	expect(pinchFactor(64, -2)).toBe(0.25);
});
