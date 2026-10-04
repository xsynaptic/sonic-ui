import { expect, test } from 'vitest';

import { adsrPath, adsrShape } from '#lib/adsr-shape.ts';

test('three bound times and the sustain run share the width in quarters', () => {
	const { handles, share } = adsrShape({
		attack: 0.5,
		decay: 0.25,
		release: 1,
		sustain: 0.6,
	});

	expect(share).toBe(0.25);
	expect(handles).toEqual([
		{ stage: 'attack', x: 0.125, y: 1 },
		{ stage: 'decay', x: 0.1875, y: 0.6 },
		{ stage: 'release', x: 0.6875, y: 0 },
	]);
});

test('with delay and hold bound too, an attack at its maximum ends a sixth past the delay', () => {
	const { handles, share } = adsrShape({
		attack: 1,
		decay: 0.5,
		delay: 0.5,
		hold: 0.25,
		release: 0.5,
		sustain: 0.5,
	});
	const at = Object.fromEntries(handles.map(({ stage, x }) => [stage, x]));

	expect(share).toBeCloseTo(1 / 6, 10);
	expect(at.delay).toBeCloseTo(1 / 12, 10);
	expect(at.attack).toBeCloseTo(1 / 12 + 1 / 6, 10);
	expect(at.hold).toBeCloseTo(1 / 12 + 1 / 6 + 1 / 24, 10);
});

test('an unbound sustain reads full level, and an unbound decay drops straight down from the hold', () => {
	const flat = adsrShape({ attack: 0.5, decay: 0.5 });

	expect(flat.handles).toEqual([
		{ stage: 'attack', x: 1 / 6, y: 1 },
		{ stage: 'decay', x: 1 / 3, y: 1 },
	]);

	const dropped = adsrShape({ attack: 0.5, sustain: 0.4 });

	expect(dropped.handles).toEqual([
		{ stage: 'attack', x: 0.25, y: 1 },
		{ stage: 'decay', x: 0.25, y: 0.4 },
	]);
});

test('with no release bound the line still drops to the floor, so the fill closes along it', () => {
	const { fill, stroke } = adsrPath(adsrShape({ attack: 1, sustain: 0.5 }));

	expect(stroke.endsWith('L1 0.5L1 1')).toBe(true);
	expect(fill).toBe(`${stroke}Z`);
});

test('a curved decay passes through its curve at the middle, where its curve handle sits', () => {
	const { curveHandles, points } = adsrShape({ attack: 0, decay: 1, sustain: 0.6 }, { decay: 4 });
	const middle = points.find(({ x }) => Math.abs(x - 1 / 6) < 1e-9);

	expect(middle?.y).toBeCloseTo(1 - 0.4 * 0.1192, 4);
	expect(curveHandles).toHaveLength(1);
	expect(curveHandles[0]).toMatchObject({ stage: 'decay', x: middle?.x, y: middle?.y });
});

test('only a curved leg is sampled, and a rising attack curves the same way a falling decay does', () => {
	const straight = adsrShape({ attack: 1, release: 1 }, { attack: 0 });
	const curved = adsrShape({ attack: 1, release: 1 }, { attack: 4 });

	expect(straight.points).toHaveLength(7);
	expect(curved.points.length).toBeGreaterThan(7);
	expect(straight.curveHandles[0]?.y).toBe(0.5);
	expect(curved.curveHandles[0]?.y).toBeCloseTo(0.1192, 4);
});
