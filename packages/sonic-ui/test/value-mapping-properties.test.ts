import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';

import type { ValueSpec } from '#lib/value-mapping.ts';

import { valueMapping } from '#lib/value-mapping.ts';

const runs = { numRuns: 2000 };

const fraction = fc.constantFrom(0, 0.1, 0.25, 0.5, 0.7, 1);

const anySpec = fc
	.record(
		{
			detent: fc.option(fraction, { nil: undefined }),
			isNotched: fc.boolean(),
			isWrapping: fc.boolean(),
			midpoint: fc.option(fraction, { nil: undefined }),
			min: fc.constantFrom(-10, -1, 0, 0.2, 1, 20),
			positions: fc.option(
				fc.uniqueArray(fc.integer({ max: 20, min: -5 }), { maxLength: 5, minLength: 2 }),
				{ nil: undefined },
			),
			range: fc.constantFrom(0, 0.9, 1, 3.3, 10, 360, 1000),
			step: fc.constantFrom(0, 0.01, 0.1, 0.25, 0.3, 1, 7.5),
			taper: fc.constantFrom('linear', 'log'),
		},
		{ noNullPrototype: true },
	)
	.map(({ detent, midpoint, positions, range, ...rest }): ValueSpec => {
		const spec: ValueSpec = { ...rest, max: Number((rest.min + range).toFixed(6)) };

		if (detent !== undefined) spec.detent = rest.min + detent * range;
		if (midpoint !== undefined) spec.midpoint = rest.min + midpoint * range;
		if (positions) spec.positions = positions.toSorted((first, second) => first - second);

		return spec;
	});

const clampedSpec = anySpec.filter((spec) => !spec.isWrapping);

const anyValue = fc.double({ max: 2000, min: -2000, noNaN: true });

const anyKey = fc.constantFrom('ArrowRight', 'ArrowLeft', 'PageUp', 'PageDown', 'Home', 'End');
const steppingKey = fc.constantFrom('ArrowRight', 'ArrowLeft', 'PageUp', 'PageDown');
const keyStep = fc.constantFrom(0, 0.5, 1, 5);
const upKeys = new Set(['ArrowRight', 'PageUp']);

test.prop([anySpec, anyValue], runs)('snap keeps its own output', (spec, value) => {
	const mapping = valueMapping(spec);
	const snapped = mapping.snap(value);

	expect(mapping.snap(snapped)).toBe(snapped);
});

test.prop([clampedSpec, anyValue], runs)(
	'a clamped value snaps inside the bounds',
	(spec, value) => {
		const mapping = valueMapping(spec);
		const snapped = mapping.snap(value);

		expect(snapped).toBeGreaterThanOrEqual(mapping.bounds[0]);
		expect(snapped).toBeLessThanOrEqual(mapping.bounds[1]);
	},
);

test.prop({ key: anyKey, spec: anySpec, stride: keyStep, value: anyValue }, runs)(
	'a key lands on a value snap keeps',
	({ key, spec, stride, value }) => {
		const mapping = valueMapping(spec);
		const target = mapping.keyTarget(key, mapping.snap(value), stride);

		expect(target).toBeDefined();
		expect(mapping.snap(target ?? NaN)).toBe(target);
	},
);

test.prop({ key: steppingKey, spec: clampedSpec, stride: keyStep, value: anyValue }, runs)(
	'a clamped key moves its own way, and always moves short of the end',
	({ key, spec, stride, value }) => {
		const mapping = valueMapping(spec);
		const from = mapping.snap(value);
		const isUp = upKeys.has(key);
		const target = mapping.keyTarget(key, from, stride) ?? NaN;
		const isAtEnd = isUp ? from >= mapping.bounds[1] : from <= mapping.bounds[0];

		if (isAtEnd) expect(target).toBe(from);
		else if (isUp) expect(target).toBeGreaterThan(from);
		else expect(target).toBeLessThan(from);
	},
);

test.prop(
	[
		anySpec.filter(
			(spec) => spec.isWrapping && spec.max > spec.min && spec.max - spec.min >= 2 * spec.step,
		),
		anyValue,
		fc.constantFrom('ArrowRight', 'ArrowLeft'),
	],
	runs,
)(
	'an endless arrow key always moves while there are two values to move between',
	(spec, value, key) => {
		const mapping = valueMapping(spec);
		const from = mapping.snap(value);

		expect(mapping.keyTarget(key, from)).not.toBe(from);
	},
);

test.prop([clampedSpec, anyValue, anyValue], runs)(
	'a clamped proportion never falls as the value rises',
	(spec, first, second) => {
		const mapping = valueMapping(spec);
		const [low, high] = first <= second ? [first, second] : [second, first];

		expect(mapping.proportionOf(low)).toBeLessThanOrEqual(mapping.proportionOf(high));
	},
);

test.prop([anySpec, anyValue], runs)(
	'a snapped value survives its proportion and back',
	(spec, value) => {
		const mapping = valueMapping(spec);
		const from = mapping.snap(value);
		const back = mapping.snap(mapping.valueAt(mapping.proportionOf(from)));
		const isContinuous = spec.step <= 0 && !spec.positions;

		if (isContinuous) expect(back).toBeCloseTo(from, 6);
		else expect(back).toBe(from);
	},
);

test.prop(
	[
		clampedSpec.filter((spec) => spec.positions !== undefined),
		fc.double({ max: 1, min: 0, noNaN: true }),
	],
	runs,
)('a drag along a list lands on the position drawn nearest it', (spec, proportion) => {
	const mapping = valueMapping(spec);
	const last = (spec.positions?.length ?? NaN) - 1;
	const landed = mapping.proportionOf(mapping.valueAt(proportion));

	expect(Math.abs(landed - proportion)).toBeLessThanOrEqual(1 / (2 * last) + 1e-12);
});

const ringSpec = fc
	.record(
		{
			min: fc.constantFrom(-4, 0, 1),
			shares: fc.uniqueArray(fc.integer({ max: 36, min: -4 }), { maxLength: 6, minLength: 2 }),
			span: fc.constantFrom(8, 100, 360),
		},
		{ noNullPrototype: true },
	)
	.map(({ min, shares, span }) => {
		const positions = shares
			.map((share) => min + (share * span) / 32)
			.toSorted((first, second) => first - second);

		return {
			kept: positions.filter((position) => position >= min && position < min + span),
			spec: {
				isNotched: false,
				isWrapping: true,
				max: min + span,
				min,
				positions,
				step: 1,
				taper: 'linear',
			} satisfies ValueSpec,
		};
	})
	.filter(({ kept }) => kept.length >= 2);

test.prop([ringSpec, fc.nat()], runs)(
	'an endless list sits evenly round the turn, and the keys walk it in order',
	({ kept, spec }, seed) => {
		const mapping = valueMapping(spec);
		const index = seed % kept.length;
		const from = kept[index] ?? NaN;

		expect(mapping.proportionOf(from)).toBeCloseTo(index / kept.length, 12);
		expect(mapping.keyTarget('ArrowRight', from)).toBe(kept[(index + 1) % kept.length]);
		expect(mapping.keyTarget('ArrowLeft', from)).toBe(kept.at(index - 1));
		expect([mapping.keyTarget('Home', from), mapping.keyTarget('End', from)]).toEqual([
			kept[0],
			kept.at(-1),
		]);
	},
);

test.prop([ringSpec], runs)(
	'an endless list snaps across the wrap to the nearer position',
	({ kept, spec }) => {
		const mapping = valueMapping(spec);
		const nudge = (spec.max - spec.min) / 100;
		const [first = NaN, last = NaN] = [kept[0], kept.at(-1)];

		expect(mapping.snap(first - nudge)).toBe(first);
		expect(mapping.snap(last + nudge)).toBe(last);
	},
);

test.prop([ringSpec, fc.double({ max: 1, min: 0, noNaN: true })], runs)(
	'a drag round an endless list lands on the position drawn nearest it',
	({ kept, spec }, proportion) => {
		const mapping = valueMapping(spec);
		const gap = Math.abs(mapping.proportionOf(mapping.valueAt(proportion)) - (proportion % 1));

		expect(Math.min(gap, 1 - gap)).toBeLessThanOrEqual(1 / (2 * kept.length) + 1e-12);
	},
);
