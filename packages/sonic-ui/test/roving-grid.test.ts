import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';

import { rovingIndex } from '#lib/roving-grid.ts';

const grid = { columns: 12, count: 36 };

test('Left and Right move one, Up and Down a row, Home and End to the ends', () => {
	expect(rovingIndex(14, 'ArrowLeft', grid)).toBe(13);
	expect(rovingIndex(14, 'ArrowRight', grid)).toBe(15);
	expect(rovingIndex(14, 'ArrowUp', grid)).toBe(26);
	expect(rovingIndex(14, 'ArrowDown', grid)).toBe(2);
	expect(rovingIndex(14, 'Home', grid)).toBe(0);
	expect(rovingIndex(14, 'End', grid)).toBe(35);
});

test('a move past an end stays put rather than wrapping or clamping', () => {
	expect(rovingIndex(0, 'ArrowLeft', grid)).toBe(0);
	expect(rovingIndex(35, 'ArrowRight', grid)).toBe(35);
	expect(rovingIndex(25, 'ArrowUp', grid)).toBe(25);
	expect(rovingIndex(11, 'ArrowDown', grid)).toBe(11);
});

test('a key that moves nothing is left to the page', () => {
	expect(rovingIndex(14, 'PageUp', grid)).toBeUndefined();
	expect(rovingIndex(14, ' ', grid)).toBeUndefined();
});

test.prop([
	fc.record({
		columns: fc.integer({ max: 24, min: 1 }),
		key: fc.constantFrom('ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'),
		rows: fc.integer({ max: 8, min: 1 }),
		seed: fc.nat(),
	}),
])('every move lands on a cell of the grid', ({ columns, key, rows, seed }) => {
	const count = columns * rows;
	const next = rovingIndex(seed % count, key, { columns, count });

	expect(next).toBeGreaterThanOrEqual(0);
	expect(next).toBeLessThan(count);
});
