import { expect, test } from 'vitest';

import { meterScale } from '#lib/meter-taper.ts';

test('on its own range the IEC law puts -20 dB at half the bar and -40 dB at 15%', () => {
	const { proportionOf } = meterScale('iec', -70, 0);

	expect(proportionOf(-20)).toBeCloseTo(0.5, 12);
	expect(proportionOf(-40)).toBeCloseTo(0.15, 12);
	expect(proportionOf(-65)).toBeCloseTo(0.0125, 12);
});

test('on a -60 to +6 bar the IEC law carries its end slopes past -70 and 0 dB', () => {
	const { proportionOf } = meterScale('iec', -90, 6);
	const at = (decibels: number): number => proportionOf(decibels);

	expect(at(-90)).toBe(0);
	expect(at(6)).toBe(1);
	expect(at(-80)).toBeGreaterThan(0);
	expect(at(3)).toBeLessThan(1);
	expect(at(3) - at(0)).toBeCloseTo(at(0) - at(-3), 12);
	expect(at(-80) - at(-90)).toBeCloseTo(at(-70) - at(-80), 12);
});

test('a linear bar spreads decibels evenly, and an empty range reads 0', () => {
	expect(meterScale('linear', -48, 12).proportionOf(-18)).toBeCloseTo(0.5, 12);
	expect(meterScale('iec', 0, 0).proportionOf(0)).toBe(0);
	expect(meterScale('iec', 0, 0).proportionCss('var(--zone)')).toBe('0');
});
