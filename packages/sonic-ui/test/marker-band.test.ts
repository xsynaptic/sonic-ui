import { expect, test } from 'vitest';

import { nearestMarker } from '#lib/marker-band.ts';

test('the nearer of two markers within reach wins, whichever comes first', () => {
	expect(nearestMarker(0.5, [0.47, 0.51], 0.05)).toBe(1);
	expect(nearestMarker(0.5, [0.51, 0.47], 0.05)).toBe(0);
});

test('a marker out of reach is not found', () => {
	expect(nearestMarker(0.5, [0.44, 0.56], 0.05)).toBeUndefined();
});

test('a marker exactly at the reach is still found', () => {
	expect(nearestMarker(0.5, [0.75], 0.25)).toBe(0);
});
