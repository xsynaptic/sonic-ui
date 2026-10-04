import { expect, test } from 'vitest';

import { createTapTempo } from '#scripts/tap-tempo.ts';

test('taps settle on the mean interval once there are two, inside the tempo range', () => {
	const tempo = createTapTempo(96);

	expect(tempo.tap(1000)).toBeUndefined();
	expect(tempo.tap(1480)).toBe(125);
	expect(tempo.tap(2000)).toBe(120);
	expect(tempo.tap(2100)).toBeCloseTo(60_000 / 366.667, 2);

	const quick = createTapTempo(96);

	quick.tap(0);
	expect(quick.tap(100)).toBe(250);
});

test('a tap after a two second gap starts over', () => {
	const tempo = createTapTempo(96);

	tempo.tap(1000);
	tempo.tap(1500);
	expect(tempo.tap(3500)).toBeUndefined();
	expect(tempo.tap(3900)).toBe(150);
});

test('the phase runs from the last tap, before it as well as after', () => {
	const tempo = createTapTempo(96);

	expect(tempo.phaseAt(625 * 3 + 156.25)).toBeCloseTo(0.25);

	tempo.tap(4500);
	tempo.tap(5000);
	expect(tempo.phaseAt(5125)).toBeCloseTo(0.25);
	expect(tempo.phaseAt(4875)).toBeCloseTo(0.75);
});

test('taps slower than the range settle on 40 bpm', () => {
	const tempo = createTapTempo(96);

	tempo.tap(0);

	expect(tempo.tap(1900)).toBe(40);
	expect(tempo.phaseAt(1900 + 375)).toBeCloseTo(0.25);
});

test('the mean runs over the last five taps, so a sixth drops the first', () => {
	const tempo = createTapTempo(96);

	for (const time of [0, 700, 1000, 1300]) tempo.tap(time);

	expect(tempo.tap(1600)).toBe(150);
	expect(tempo.tap(1900)).toBe(200);
});
