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
			step: fc.constantFrom(0, 0.01, 0.1, 0.2, 0.25, 0.3, 1, 2, 7.5, 90),
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

function stepDistances(spec: ValueSpec, value: number): Array<[number, number]> {
	const range = spec.max - spec.min;
	const count = spec.isWrapping
		? Math.ceil(range / spec.step - 1e-9)
		: Math.floor(range / spec.step + 1e-9) + 1;
	const grid = Array.from({ length: count }, (_, index) => spec.min + index * spec.step);

	return grid.map((step) => {
		if (!spec.isWrapping) return [step, Math.abs(step - value)];

		const gap = (((step - value) % range) + range) % range;

		return [step, Math.min(gap, range - gap)];
	});
}

test.prop(
	[
		anySpec.filter((spec) => spec.step > 0 && !spec.positions && spec.max > spec.min),
		fc.integer({ max: 2, min: -2 }),
		fc.double({ max: 1, min: 0, noNaN: true }),
	],
	runs,
)(
	'a stepped value snaps to the nearest step, round the turn when endless',
	(spec, turns, along) => {
		const value = spec.min + (turns + along) * (spec.max - spec.min);
		const snapped = valueMapping(spec).snap(value);
		const distances = stepDistances(spec, value);
		const nearest = Math.min(...distances.map(([, distance]) => distance));
		const [, landed = NaN] =
			distances.find(([step]) => Math.abs(step - snapped) < 1e-9 * Math.max(1, Math.abs(step))) ??
			[];

		expect(landed).toBeLessThanOrEqual(nearest + 1e-9 * Math.max(1, Math.abs(value)));
	},
);

test.prop(
	[
		anySpec.filter(
			(spec) =>
				spec.isWrapping && !spec.positions && spec.midpoint === undefined && spec.max > spec.min,
		),
		fc.double({ max: 1, min: 0, noNaN: true }),
	],
	runs,
)(
	'an endless proportion inside the bounds matches the clamped one, round the turn',
	(spec, along) => {
		const endless = valueMapping({ ...spec, taper: 'linear' });
		const clamped = valueMapping({ ...spec, isWrapping: false, taper: 'linear' });
		const value = clamped.bounds[0] + along * (clamped.bounds[1] - clamped.bounds[0]);

		const apart = Math.abs(endless.proportionOf(value) - clamped.proportionOf(value)) % 1;

		expect(Math.min(apart, 1 - apart)).toBeLessThan(1e-9);
	},
);

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

test.prop(
	{
		along: fc.double({ max: 1, min: 0, noNaN: true }),
		key: steppingKey,
		spec: clampedSpec.filter((spec) => spec.detent !== undefined),
		stride: keyStep,
	},
	runs,
)(
	'a clamped key stops on the detent only when the detent lies inside its move',
	({ along, key, spec, stride }) => {
		const { detent = NaN, ...free } = spec;
		const mapping = valueMapping(spec);
		const from = mapping.snap(spec.min + along * (spec.max - spec.min));
		const unheld = valueMapping(free).keyTarget(key, from, stride) ?? NaN;
		const caught = mapping.snap(detent);
		const isInside =
			Math.sign(caught - from) === Math.sign(unheld - from) &&
			Math.abs(caught - from) < Math.abs(unheld - from);

		expect(mapping.keyTarget(key, from, stride)).toBe(isInside ? caught : unheld);
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

const taperedSpec = fc
	.record(
		{
			midpoint: fc.constantFrom(0.1, 0.25, 0.7, 0.9),
			min: fc.constantFrom(-60, -10, 0.5, 20),
			range: fc.constantFrom(10, 66, 1000, 19_980),
			step: fc.constantFrom(0, 0.25, 0.5, 1, 7.5),
			taper: fc.constantFrom('linear', 'log'),
		},
		{ noNullPrototype: true },
	)
	.map(({ midpoint, min, range, step, taper }): ValueSpec => ({
		isNotched: false,
		isWrapping: false,
		max: min + range,
		midpoint: min + midpoint * range,
		min,
		step,
		taper,
	}));

function taperStops(spec: ValueSpec): ReadonlyArray<number> {
	const mapping = valueMapping(spec);

	return Array.from({ length: 101 }, (_, hundredth) =>
		mapping.snap(mapping.valueAt(hundredth / 100)),
	);
}

test.prop([taperedSpec, anyValue], runs)(
	'an arrow on a taper lands on the nearest stop a hundredth of the travel apart, its own way',
	(spec, value) => {
		const mapping = valueMapping(spec);
		const from = mapping.snap(value);
		const stops = taperStops(spec);
		const above = stops.filter((stop) => stop > from);
		const below = stops.filter((stop) => stop < from);

		expect(mapping.keyTarget('ArrowUp', from)).toBe(above.length > 0 ? Math.min(...above) : from);
		expect(mapping.keyTarget('ArrowDown', from)).toBe(below.length > 0 ? Math.max(...below) : from);
	},
);

const hundredth = fc.integer({ max: 100, min: 0 });
const direction = fc.constantFrom(
	{ arrow: 'ArrowUp', arrowBack: 'ArrowDown', end: 1, page: 'PageUp', pageBack: 'PageDown' },
	{ arrow: 'ArrowDown', arrowBack: 'ArrowUp', end: 0, page: 'PageDown', pageBack: 'PageUp' },
);

test.prop([taperedSpec, hundredth, direction], runs)(
	'from a stop on a taper, an arrow and then its opposite come back',
	(spec, along, { arrow, arrowBack, end }) => {
		const mapping = valueMapping(spec);
		const from = taperStops(spec)[along] ?? NaN;
		fc.pre(from !== mapping.bounds[end]);

		const moved = mapping.keyTarget(arrow, from) ?? NaN;

		expect(mapping.keyTarget(arrowBack, moved)).toBe(from);
	},
);

test.prop([taperedSpec, hundredth, direction], runs)(
	'a page on a taper is ten arrows, and comes back short of the end',
	(spec, along, { arrow, end, page, pageBack }) => {
		const mapping = valueMapping(spec);
		const from = taperStops(spec)[along] ?? NaN;
		let arrowed = from;
		for (let press = 0; press < 10; press++) arrowed = mapping.keyTarget(arrow, arrowed) ?? NaN;
		const paged = mapping.keyTarget(page, from) ?? NaN;

		expect(paged).toBe(arrowed);
		if (paged !== mapping.bounds[end]) expect(mapping.keyTarget(pageBack, paged)).toBe(from);
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
