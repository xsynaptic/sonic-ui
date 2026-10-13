import { expect, test } from 'vitest';

import {
	clippedEnds,
	fadeWidth,
	legDeparture,
	legFades,
	legPosition,
	tickerLeg,
} from '#lib/ticker-leg.ts';

const travel = { distance: 120, hold: 1500, rate: 48 };

test('from the start a leg holds, then crosses the distance at the rate', () => {
	expect(tickerLeg(travel, { from: 0, heading: 1 })).toEqual({
		duration: 2500,
		from: 0,
		heading: 1,
		hold: 1500,
		to: 120,
	});
});

test('a drop part of the way carries on the way it was heading, for what is left', () => {
	expect(tickerLeg(travel, { from: 30, heading: 1 })).toMatchObject({ duration: 1875, to: 120 });
	expect(tickerLeg(travel, { from: 30, heading: -1 })).toMatchObject({ duration: 625, to: 0 });
});

test.each([
	['the far end, heading for it', { from: 120, heading: 1 }, { heading: -1, to: 0 }],
	['the start, heading for it', { from: 0, heading: -1 }, { heading: 1, to: 120 }],
	['the far end, heading back', { from: 120, heading: -1 }, { heading: -1, to: 0 }],
] as const)('dropped at %s, the leg crosses the whole distance', (_case, departure, leg) => {
	expect(tickerLeg(travel, departure)).toMatchObject({ ...leg, duration: 2500 });
});

test('a distance that shrinks under the tape pulls it in and turns it at the new end', () => {
	expect(tickerLeg({ ...travel, distance: 60 }, { from: 90, heading: 1 })).toMatchObject({
		duration: 1250,
		from: 60,
		heading: -1,
		to: 0,
	});
});

test('a departure may carry its own hold, and none is a hold of 0', () => {
	expect(tickerLeg(travel, { from: 0, heading: 1, hold: 400 })?.hold).toBe(400);
	expect(tickerLeg({ ...travel, hold: 0 }, { from: 0, heading: 1 })?.hold).toBe(0);
	expect(tickerLeg({ ...travel, hold: -200 }, { from: 0, heading: 1 })?.hold).toBe(0);
});

test.each([
	['content that fits', { distance: 0 }],
	['a rate of zero', { rate: 0 }],
	['a rate below zero', { rate: -48 }],
	['a distance that is not a number', { distance: NaN }],
])('%s gives no leg', (_case, change) => {
	expect(tickerLeg({ ...travel, ...change }, { from: 0, heading: 1 })).toBeUndefined();
});

test('a leg stands still through its hold and stops at its end', () => {
	const back = tickerLeg(travel, { from: 120, heading: 1 });
	if (!back) throw new Error('No leg');

	expect(legPosition(back, 900)).toBe(120);
	expect(legPosition(back, 1500 + 625)).toBe(90);
	expect(legPosition(back, 9000)).toBe(0);
});

test('a leg picked up in its hold keeps what is left of the hold, and one travelling has none', () => {
	const out = tickerLeg(travel, { from: 0, heading: 1 });
	if (!out) throw new Error('No leg');

	expect(legDeparture(out, 600)).toEqual({ from: 0, heading: 1, hold: 900 });
	expect(legDeparture(out, 1500 + 1250)).toEqual({ from: 60, heading: 1, hold: 0 });
});

test('an end is clipped when content lies past it', () => {
	expect(clippedEnds(0, 120)).toBe('end');
	expect(clippedEnds(45, 120)).toBe('start end');
	expect(clippedEnds(120, 120)).toBe('start');
	expect(clippedEnds(0, 0)).toBeUndefined();
});

test('a fade is a third of the content past its end, up to the full fade', () => {
	expect(fadeWidth(0, 12)).toBe(0);
	expect(fadeWidth(15, 12)).toBe(5);
	expect(fadeWidth(36, 12)).toBe(12);
	expect(fadeWidth(90, 12)).toBe(12);
	expect(fadeWidth(-6, 12)).toBe(0);
});

test('over a leg the fade behind grows as the tape leaves, and the one ahead narrows to nothing as it lands', () => {
	const out = tickerLeg(travel, { from: 0, heading: 1 });
	if (!out) throw new Error('No leg');

	expect(legFades(out, 120, 12)).toEqual({
		end: { delay: 1500 + 1750, duration: 750, widths: [12, 0] },
		start: { delay: 1500, duration: 750, widths: [0, 12] },
	});
});

test('a leg picked up within reach of an end starts that fade part of the way', () => {
	const back = tickerLeg(travel, { from: 24, heading: -1, hold: 0 });
	if (!back) throw new Error('No leg');

	expect(legFades(back, 120, 12)).toMatchObject({
		end: { duration: 0, widths: [12, 12] },
		start: { delay: 0, duration: 500, widths: [8, 0] },
	});
});

test('a distance shorter than the reach of both fades never shows either in full', () => {
	const out = tickerLeg({ ...travel, distance: 24 }, { from: 0, heading: 1 });
	if (!out) throw new Error('No leg');

	expect(legFades(out, 24, 12)).toEqual({
		end: { delay: 1500, duration: 500, widths: [8, 0] },
		start: { delay: 1500, duration: 500, widths: [0, 8] },
	});
});
