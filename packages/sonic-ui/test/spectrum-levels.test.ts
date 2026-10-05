import { expect, test } from 'vitest';

import type { SpectrumLevels } from '#lib/spectrum-levels.ts';

import { areSettled, createLevels, receiveLevels, stepLevels } from '#lib/spectrum-levels.ts';

const floor = -72;

function runTo(
	levels: SpectrumLevels,
	[fromMs, toMs, frameMs]: [number, number, number],
	options: { isHeld?: boolean; isHoldStepped?: boolean } = {},
): void {
	for (let nowMs = fromMs + frameMs; nowMs <= toMs; nowMs += frameMs) {
		stepLevels(levels, {
			elapsedMs: frameMs,
			floor,
			isHeld: options.isHeld ?? true,
			isHoldStepped: options.isHoldStepped ?? false,
			nowMs,
		});
	}
}

function received(frame: Array<number>): SpectrumLevels {
	const levels = createLevels(frame.length);

	receiveLevels(levels, frame, floor);
	stepLevels(levels, { elapsedMs: 16, floor, isHeld: true, isHoldStepped: false, nowMs: 0 });

	return levels;
}

test('a received level is drawn before it falls', () => {
	expect([...received([-10]).bars]).toEqual([-10]);
});

test('two frames before a step keep the louder of each bin', () => {
	const levels = createLevels(2);

	receiveLevels(levels, [-10, -50], floor);
	receiveLevels(levels, [-40, -20], floor);
	stepLevels(levels, { elapsedMs: 0, floor, isHeld: true, isHoldStepped: false, nowMs: 0 });

	expect([...levels.bars]).toEqual([-10, -20]);
});

test('a level that is not finite counts as the floor', () => {
	expect([...received([-Infinity, NaN, -20]).bars]).toEqual([floor, floor, -20]);
});

test.each([20, 250])('a bar falls 20 dB in a second in %dms frames', (frameMs) => {
	const levels = received([-10]);

	runTo(levels, [0, 1000, frameMs]);

	expect(levels.bars[0]).toBeCloseTo(-30, 6);
});

test('the hold keeps for 1,500ms, then falls at the rate of the bar', () => {
	const levels = received([-10]);

	runTo(levels, [0, 1400, 200]);
	expect(levels.holds[0]).toBe(-10);

	runTo(levels, [1400, 1600, 200]);
	expect(levels.holds[0]).toBeCloseTo(-12, 6);

	runTo(levels, [1600, 2000, 200]);
	expect(levels.holds[0]).toBeCloseTo(-20, 6);
	expect(levels.bars[0]).toBeCloseTo(-50, 6);
});

test('a stepped hold drops to the bar when its hold ends', () => {
	const levels = received([-10]);

	runTo(levels, [0, 1400, 200], { isHoldStepped: true });
	expect(levels.holds[0]).toBe(-10);

	runTo(levels, [1400, 1600, 200], { isHoldStepped: true });
	expect(levels.holds[0]).toBeCloseTo(-42, 6);
});

test('with no hold wanted, the hold follows the bar', () => {
	const levels = received([-10]);

	runTo(levels, [0, 500, 100], { isHeld: false });

	expect(levels.holds[0]).toBeCloseTo(-20, 6);
});

test('the levels settle only once the hold has landed too', () => {
	const levels = received([-10]);

	runTo(levels, [0, 4000, 100]);
	expect(levels.bars[0]).toBe(floor);
	expect(areSettled(levels, floor)).toBe(false);

	runTo(levels, [4000, 4700, 100]);
	expect(areSettled(levels, floor)).toBe(true);
});
