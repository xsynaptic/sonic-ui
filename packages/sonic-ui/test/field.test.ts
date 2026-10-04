import { expect, test } from 'vitest';

import type { FieldMove } from '#lib/field.ts';
import type { ValueSpec } from '#lib/value-mapping.ts';

import { startFieldDrag, stepFieldDrag } from '#lib/field.ts';

import { mappingOf } from './helpers.ts';

interface Plane {
	moves: Array<Partial<FieldMove> & Pick<FieldMove, 'x' | 'y'>>;
	x?: Partial<ValueSpec> | undefined;
	y?: Partial<ValueSpec> | undefined;
}

function axisStart(spec: Partial<ValueSpec>) {
	const mapping = mappingOf(spec);

	return { from: mapping.snap(mapping.valueAt(0.5)), mapping, proportion: 0.5, travelPx: 200 };
}

function drag({ moves, x = {}, y = {} }: Plane): Array<[number | undefined, number | undefined]> {
	const starts = { x: axisStart(x), y: axisStart(y) };
	const mappings = { x: starts.x.mapping, y: starts.y.mapping };
	let state = startFieldDrag({ position: { x: 0, y: 0 }, thresholdPx: 3, ...starts });

	return moves.map((move) => {
		const step = stepFieldDrag(mappings, state, { isFine: false, isLocked: false, ...move });

		state = step.state;

		return [step.x, step.y];
	});
}

test('the threshold is the distance travelled, not each axis on its own', () => {
	expect(
		drag({
			moves: [
				{ x: 2, y: 2 },
				{ x: 2.5, y: 2.5 },
			],
			x: { step: 0.25 },
			y: { step: 0.25 },
		}),
	).toEqual([
		[undefined, undefined],
		[51.25, 51.25],
	]);
});

test('a locked axis follows the pointer, so lifting the lock steps it from there', () => {
	expect(
		drag({
			moves: [
				{ isLocked: true, x: 40, y: 10 },
				{ x: 40, y: 30 },
			],
		}),
	).toEqual([
		[70, undefined],
		[70, 60],
	]);
});

test('the lock is chosen once and holds while a later move has the other axis ahead', () => {
	expect(
		drag({
			moves: [
				{ isLocked: true, x: 4, y: 20 },
				{ isLocked: true, x: 60, y: 30 },
			],
		}),
	).toEqual([
		[undefined, 60],
		[undefined, 65],
	]);
});

test('a fine move covers a tenth of the travel on both axes', () => {
	expect(drag({ moves: [{ isFine: true, x: 100, y: 100 }] })).toEqual([[55, 55]]);
});

test('an absent axis returns nothing, and its travel still engages the gesture', () => {
	const y = axisStart({});
	const start = startFieldDrag({ position: { x: 0, y: 0 }, thresholdPx: 3, y });
	const along = stepFieldDrag({ y: y.mapping }, start, {
		isFine: false,
		isLocked: false,
		x: 5,
		y: 0,
	});

	expect([along.state.isEngaged, along.x, along.y]).toEqual([true, undefined, 50]);

	const diagonal = stepFieldDrag({ y: y.mapping }, along.state, {
		isFine: false,
		isLocked: true,
		x: 40,
		y: 10,
	});

	expect([diagonal.x, diagonal.y]).toEqual([undefined, 55]);
});

test('each axis steps along its own mapping', () => {
	expect(
		drag({
			moves: [{ x: 50, y: 25 }],
			x: { max: 20_000, min: 20, taper: 'log' },
			y: { max: 24, min: -24, step: 0.5 },
		}),
	).toEqual([[3557, 6]]);
});
