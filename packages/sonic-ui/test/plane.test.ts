import { expect, test } from 'vitest';

import type { PlaneMove } from '#lib/plane.ts';
import type { RangeSpec } from '#lib/range-scale.ts';

import { startPlaneDrag, stepPlaneDrag } from '#lib/plane.ts';

import { scaleOf } from './helpers.ts';

interface Plane {
	moves: Array<Partial<PlaneMove> & Pick<PlaneMove, 'x' | 'y'>>;
	x?: Partial<RangeSpec> | undefined;
	y?: Partial<RangeSpec> | undefined;
}

function axisStart(spec: Partial<RangeSpec>) {
	const scale = scaleOf(spec);

	return { from: scale.snap(scale.valueAt(0.5)), place: 0.5, scale, travelPx: 200 };
}

function drag({ moves, x = {}, y = {} }: Plane): Array<[number | undefined, number | undefined]> {
	const starts = { x: axisStart(x), y: axisStart(y) };
	const scales = { x: starts.x.scale, y: starts.y.scale };
	let state = startPlaneDrag({ position: { x: 0, y: 0 }, thresholdPx: 3, ...starts });

	return moves.map((move) => {
		const step = stepPlaneDrag(scales, state, { isFine: false, isLocked: false, ...move });

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
	const start = startPlaneDrag({ position: { x: 0, y: 0 }, thresholdPx: 3, y });
	const along = stepPlaneDrag({ y: y.scale }, start, {
		isFine: false,
		isLocked: false,
		x: 5,
		y: 0,
	});

	expect([along.state.isEngaged, along.x, along.y]).toEqual([true, undefined, 50]);

	const diagonal = stepPlaneDrag({ y: y.scale }, along.state, {
		isFine: false,
		isLocked: true,
		x: 40,
		y: 10,
	});

	expect([diagonal.x, diagonal.y]).toEqual([undefined, 55]);
});

test('each axis steps along its own scale', () => {
	expect(
		drag({
			moves: [{ x: 50, y: 25 }],
			x: { max: 20_000, min: 20, taper: 'log' },
			y: { max: 24, min: -24, step: 0.5 },
		}),
	).toEqual([[3557, 6]]);
});
