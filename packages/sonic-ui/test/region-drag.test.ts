import { expect, test } from 'vitest';

import { moveRegionTo, regionAt, startRegionDrag, stepRegionDrag } from '#lib/region-drag.ts';

import { mappingOf } from './helpers.ts';

// 2px a second, from 10
const mapping = mappingOf({ max: 160, min: 10, step: 0.5 });

function dragFrom(position: number): ReturnType<typeof startRegionDrag> {
	return startRegionDrag({
		from: { end: 54, start: 42 },
		position,
		thresholdPx: 3,
		widthPx: 300,
	});
}

test('travel short of the threshold is still a press, and at the threshold the region moves by the whole travel', () => {
	const pressed = stepRegionDrag(mapping, dragFrom(100), { isFine: false, position: 102 });

	expect(pressed.span).toBeUndefined();

	const dragged = stepRegionDrag(mapping, pressed.state, { isFine: false, position: 103 });

	expect(dragged.span).toEqual({ end: 55.5, start: 43.5 });
});

test('once dragging, a return inside the threshold still moves the region', () => {
	const { state } = stepRegionDrag(mapping, dragFrom(100), { isFine: false, position: 120 });

	expect(stepRegionDrag(mapping, state, { isFine: false, position: 101 }).span).toEqual({
		end: 54.5,
		start: 42.5,
	});
});

test('fine movement moves a tenth as far from where it began, and keeps what came before', () => {
	const coarse = stepRegionDrag(mapping, dragFrom(100), { isFine: false, position: 120 });

	expect(coarse.span).toEqual({ end: 64, start: 52 });
	expect(stepRegionDrag(mapping, coarse.state, { isFine: true, position: 150 }).span).toEqual({
		end: 65.5,
		start: 53.5,
	});
});

test.each([
	[2000, { end: 160, start: 148 }],
	[-2000, { end: 22, start: 10 }],
])('a drag to %ipx stops at the bound with its length kept', (position, span) => {
	expect(stepRegionDrag(mapping, dragFrom(100), { isFine: false, position }).span).toEqual(span);
});

test('a start between two steps lands on a step, and the length is kept', () => {
	expect(moveRegionTo(mapping, { end: 54.3, start: 42.1 }, 80.2)).toEqual({
		end: 92.2,
		start: 80,
	});
});

test('of two overlapping bodies the later one takes the press, and one that takes no press is passed over', () => {
	expect(
		regionAt(
			[
				[10, 60],
				[40, 90],
			],
			50,
		),
	).toBe(1);
	expect(regionAt([[10, 60], undefined], 50)).toBe(0);
	expect(
		regionAt(
			[
				[10, 60],
				[40, 90],
			],
			20,
		),
	).toBe(0);
	expect(
		regionAt(
			[
				[10, 60],
				[40, 90],
			],
			91,
		),
	).toBeUndefined();
});
