import { expect, test } from 'vitest';

import type { Position } from '#lib/positions.ts';

import {
	enabledEnds,
	isMomentaryAt,
	keyTarget,
	pressTarget,
	restOf,
	soleStep,
	stepFrom,
} from '#lib/positions.ts';

function positionsOf(marks: string): Array<Position> {
	return marks.split(' ').map((mark) => ({ isDisabled: mark === 'x', isMomentary: mark === 'm' }));
}

test('a step passes a disabled position, and two in a row', () => {
	expect(stepFrom(positionsOf('- x -'), 0, { isWrapping: false, step: 1 })).toBe(2);
	expect(stepFrom(positionsOf('- x x -'), 3, { isWrapping: false, step: -1 })).toBe(0);
});

test('a step off the end stays there when clamping and comes round when wrapping', () => {
	expect(stepFrom(positionsOf('- - -'), 2, { isWrapping: false, step: 1 })).toBe(2);
	expect(stepFrom(positionsOf('- - -'), 2, { isWrapping: true, step: 1 })).toBe(0);
	expect(stepFrom(positionsOf('- - -'), 0, { isWrapping: true, step: -1 })).toBe(2);
});

test('a step toward a disabled end finds nothing when clamping and wraps past it otherwise', () => {
	expect(stepFrom(positionsOf('- - x'), 1, { isWrapping: false, step: 1 })).toBeUndefined();
	expect(stepFrom(positionsOf('- - x'), 1, { isWrapping: true, step: 1 })).toBe(0);
	expect(stepFrom(positionsOf('x - x'), 1, { isWrapping: true, step: 1 })).toBe(1);
});

test('a step from no position starts at the near end, and a row with nothing enabled gives none', () => {
	expect(stepFrom(positionsOf('- - -'), -1, { isWrapping: false, step: 1 })).toBe(0);
	expect(stepFrom(positionsOf('x - -'), -1, { isWrapping: false, step: -1 })).toBeUndefined();
	expect(stepFrom(positionsOf('x x'), 0, { isWrapping: true, step: 1 })).toBeUndefined();
	expect(stepFrom([], -1, { isWrapping: true, step: 1 })).toBeUndefined();
});

test.each([
	['ArrowRight', 2],
	['ArrowDown', 2],
	['ArrowLeft', 0],
	['ArrowUp', 0],
])('%s from the middle of three goes to %i', (key, expected) => {
	expect(keyTarget(positionsOf('- - -'), 1, { isWrapping: false, key })).toBe(expected);
});

test('an arrow with nowhere to go stays put, so the key is still taken', () => {
	expect(keyTarget(positionsOf('- - x'), 1, { isWrapping: false, key: 'ArrowRight' })).toBe(1);
	expect(keyTarget(positionsOf('-'), 0, { isWrapping: true, key: 'ArrowLeft' })).toBe(0);
});

test('Home and End go to the enabled ends, and nowhere when nothing is enabled', () => {
	expect(keyTarget(positionsOf('x - - x'), 2, { isWrapping: true, key: 'Home' })).toBe(1);
	expect(keyTarget(positionsOf('x - - x'), 1, { isWrapping: true, key: 'End' })).toBe(2);
	expect(keyTarget(positionsOf('x x'), 0, { isWrapping: true, key: 'Home' })).toBeUndefined();
	expect(keyTarget(positionsOf('x x'), 0, { isWrapping: true, key: 'End' })).toBeUndefined();
});

test('a key that is not a step is left alone', () => {
	expect(keyTarget(positionsOf('- - -'), 1, { isWrapping: true, key: 'Enter' })).toBeUndefined();
});

test('the enabled ends skip disabled positions, and are -1 when there are none', () => {
	expect(enabledEnds(positionsOf('x - x - x'))).toEqual([1, 3]);
	expect(enabledEnds(positionsOf('-'))).toEqual([0, 0]);
	expect(enabledEnds(positionsOf('x x'))).toEqual([-1, -1]);
});

test('only an end is momentary, and a lone position never is', () => {
	expect([0, 1, 2].map((index) => isMomentaryAt(positionsOf('m m m'), index))).toEqual([
		true,
		false,
		true,
	]);
	expect(isMomentaryAt(positionsOf('m'), 0)).toBe(false);
	expect(isMomentaryAt(positionsOf('- m'), 0)).toBe(false);
	expect(isMomentaryAt([], -1)).toBe(false);
});

test('with two positions a press anywhere goes to the other one; with three, or nothing checked, it goes where it landed', () => {
	expect(pressTarget(positionsOf('- -'), 0, 0)).toBe(1);
	expect(pressTarget(positionsOf('- -'), 1, 1)).toBe(0);
	expect(pressTarget(positionsOf('- -'), -1, 1)).toBe(1);
	expect(pressTarget(positionsOf('- - -'), 0, 0)).toBe(0);
});

test('a held momentary end springs back to its neighbour, and a latching position has no rest', () => {
	expect(restOf(positionsOf('m - -'), 0)).toBe(1);
	expect(restOf(positionsOf('- - m'), 2)).toBe(1);
	expect(restOf(positionsOf('- m -'), 1)).toBeUndefined();
	expect(restOf(positionsOf('- - m'), 1)).toBeUndefined();
	expect(restOf(positionsOf('- - m'), -1)).toBeUndefined();
});

test('at an end, or with only disabled positions to one side, there is one way to go', () => {
	expect(soleStep(positionsOf('- -'), 0)).toBe(1);
	expect(soleStep(positionsOf('- - -'), 2)).toBe(1);
	expect(soleStep(positionsOf('- - x'), 1)).toBe(0);
	expect(soleStep(positionsOf('x - x -'), 3)).toBe(1);
});

test('with two ways to go, or none, the side pressed decides', () => {
	expect(soleStep(positionsOf('- - -'), 1)).toBeUndefined();
	expect(soleStep(positionsOf('- - -'), -1)).toBeUndefined();
	expect(soleStep(positionsOf('- x'), 0)).toBeUndefined();
	expect(soleStep(positionsOf('x x'), 0)).toBeUndefined();
});
