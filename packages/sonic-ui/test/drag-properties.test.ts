import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';

import type { ValueSpec } from '#lib/value-mapping.ts';

import { startDrag, stepDrag } from '#lib/drag-step.ts';
import { startRegionDrag, stepRegionDrag } from '#lib/region-drag.ts';
import { valueMapping } from '#lib/value-mapping.ts';

const runs = { numRuns: 1000 };

const spec = fc
	.record(
		{
			isWrapping: fc.boolean(),
			min: fc.constantFrom(-30, -1, 0, 0.2, 20),
			range: fc.constantFrom(1, 3.3, 36, 360),
			step: fc.constantFrom(0, 0.01, 0.25, 0.5, 1, 7.5),
			taper: fc.constantFrom('linear', 'log'),
		},
		{ noNullPrototype: true },
	)
	.map(({ range, ...rest }): ValueSpec => ({
		...rest,
		isNotched: false,
		max: Number((rest.min + range).toFixed(6)),
	}));

const travelPx = fc.constantFrom(40, 160, 333);
const thresholdPx = fc.constantFrom(0, 3, 7);
const moves = fc.array(fc.integer({ max: 12, min: -12 }), { maxLength: 24, minLength: 1 });

function startOf(mapping: ReturnType<typeof valueMapping>, along: number): number {
	const [low, high] = mapping.bounds;

	return mapping.snap(low + along * (high - low));
}

test.prop(
	{
		along: fc.double({ max: 1, min: 0, noNaN: true }),
		isFine: fc.boolean(),
		moves,
		spec,
		thresholdPx,
		travelPx,
	},
	runs,
)(
	'with no detent, a drag that brings the pointer back to where it went down is back on its first value',
	({ along, isFine, moves: steps, spec: drawn, thresholdPx: threshold, travelPx: travel }) => {
		const mapping = valueMapping(drawn);
		const from = startOf(mapping, along);
		const proportion = mapping.proportionOf(from);
		const pace = isFine ? 0.1 : 1;
		let position = 0;
		let lowest = proportion;
		let highest = proportion;
		let state = startDrag(mapping, {
			from,
			position,
			proportion,
			thresholdPx: threshold,
			travelPx: travel,
		});

		for (const delta of [...steps, -steps.reduce((sum, next) => sum + next, 0)]) {
			position += delta;

			const reach = proportion + (position / travel) * pace;

			lowest = Math.min(lowest, reach);
			highest = Math.max(highest, reach);
			state = stepDrag(mapping, state, { isFine, isOutside: false, position }).state;
		}

		const isInside = mapping.isWrapping || (lowest >= 0 && highest <= 1);
		if (!isInside) return;

		const back = mapping.snap(mapping.valueAt(state.rawProportion));

		if (drawn.step > 0) expect(back).toBe(from);
		else expect(back).toBeCloseTo(from, 6);
	},
);

interface Sweep {
	direction: number;
	held: number;
	pace: number;
	reach: number;
	zone: number;
}

function sweepLanding({ direction, held, pace, reach, zone }: Sweep): 'held' | number | undefined {
	const past = (direction * (reach - held)) / pace;

	const isTie = pace !== 1 && (Math.abs(past) < 1e-9 || Math.abs(past - zone) < 1e-9);
	if (isTie) return undefined;
	if (past < 0) return reach;
	if (past <= zone) return 'held';

	return held + direction * (past - zone) * pace;
}

test.prop(
	{
		detentAlong: fc.double({ max: 0.9, min: 0.1, noNaN: true }),
		isFine: fc.boolean(),
		leadPx: fc.integer({ max: 40, min: -40 }),
		strides: fc.array(fc.integer({ max: 9, min: 1 }), { maxLength: 30, minLength: 1 }),
		travelPx: fc.constantFrom(64, 128, 256),
		zonePx: fc.constantFrom(4, 8, 13),
	},
	runs,
)(
	'a sweep across a detent holds on it for the zone in pointer pixels, fine or not, then moves on from it',
	({ detentAlong, isFine, leadPx, strides, travelPx: travel, zonePx }) => {
		const mapping = valueMapping({
			isNotched: false,
			isWrapping: false,
			max: 32,
			min: -32,
			step: 0.5,
			taper: 'linear',
		});
		const detent = mapping.snap(-32 + detentAlong * 64);
		const held = mapping.proportionOf(detent);
		const zone = zonePx / travel;
		const pace = isFine ? 0.1 : 1;
		const from = mapping.snap(mapping.valueAt(held - (leadPx / travel) * pace));
		const start = mapping.proportionOf(from);
		const direction = start <= held ? 1 : -1;
		let position = 0;
		let state = startDrag(mapping, {
			detent: { value: detent, zone },
			from,
			position,
			proportion: start,
			thresholdPx: 0,
			travelPx: travel,
		});

		for (const stride of strides) {
			position += direction * stride;

			const reach = start + (position / travel) * pace;
			const step = stepDrag(mapping, state, { isFine, isOutside: false, position });

			state = step.state;
			if (reach < 0 || reach > 1) return;

			const landing = sweepLanding({ direction, held, pace, reach, zone });

			if (landing === 'held') expect(step.value).toBe(detent);
			else if (landing !== undefined) expect(state.rawProportion).toBeCloseTo(landing, 9);
		}
	},
);

test.prop(
	{
		along: fc.double({ max: 1, min: 0, noNaN: true }),
		isFine: fc.boolean(),
		length: fc.constantFrom(0, 0.5, 12, 80, 150),
		moves,
		thresholdPx,
	},
	runs,
)(
	'a dragged region keeps its length and stays inside the bounds, and moves only once the pointer has gone the threshold',
	({ along, isFine, length, moves: steps, thresholdPx: threshold }) => {
		const mapping = valueMapping({
			isNotched: false,
			isWrapping: false,
			max: 160,
			min: 10,
			step: 0.5,
			taper: 'linear',
		});
		const start = mapping.snap(10 + along * (150 - length));
		const from = { end: start + length, start };
		let position = 100;
		let hasTravelled = false;
		let state = startRegionDrag({ from, position, thresholdPx: threshold, widthPx: 300 });

		for (const delta of steps) {
			position += delta * 5;
			hasTravelled = hasTravelled || Math.abs(position - 100) >= threshold;

			const step = stepRegionDrag(mapping, state, { isFine, position });

			state = step.state;
			expect(step.span !== undefined).toBe(hasTravelled);
			if (!step.span) continue;

			expect(step.span.end - step.span.start).toBeCloseTo(length, 9);
			expect(step.span.start).toBeGreaterThanOrEqual(10);
			expect(step.span.end).toBeLessThanOrEqual(160 + 1e-9);
		}
	},
);

test('a drag pushed exactly the zone past the detent is still held, so turning back stays on it', () => {
	const mapping = valueMapping({
		isNotched: false,
		isWrapping: false,
		max: 32,
		min: -32,
		step: 0.5,
		taper: 'linear',
	});
	let state = startDrag(mapping, {
		detent: { value: 0, zone: 8 / 128 },
		from: 0,
		position: 0,
		proportion: 0.5,
		thresholdPx: 0,
		travelPx: 128,
	});
	const values = [8, 7].map((position) => {
		const step = stepDrag(mapping, state, { isFine: false, isOutside: false, position });

		state = step.state;

		return step.value;
	});

	expect(values).toEqual([0, 0]);
});
