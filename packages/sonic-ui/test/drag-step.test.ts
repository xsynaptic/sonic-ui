import { expect, test } from 'vitest';

import type { DragMove } from '#lib/drag-step.ts';
import type { ValueSpec } from '#lib/value-mapping.ts';

import { startDrag, stepDrag } from '#lib/drag-step.ts';

import { mappingOf } from './helpers.ts';

interface Drag {
	detent?: number;
	from: number;
	moves: Array<number | (Partial<DragMove> & Pick<DragMove, 'position'>)>;
	spec?: Partial<ValueSpec>;
	thresholdPx?: number;
}

function drag({ detent, from, moves, spec, thresholdPx = 3 }: Drag): Array<number | undefined> {
	const mapping = mappingOf(spec);
	const start = {
		from,
		position: 0,
		proportion: mapping.proportionOf(from),
		thresholdPx,
		travelPx: 160,
	};
	let state = startDrag(
		mapping,
		detent === undefined ? start : { ...start, detent: { value: detent, zone: 8 / 160 } },
	);

	return moves.map((move) => {
		const step = stepDrag(mapping, state, {
			isFine: false,
			isOutside: false,
			...(typeof move === 'number' ? { position: move } : move),
		});

		state = step.state;

		return step.value;
	});
}

const detented = { max: 6, min: -30, step: 0.5 };

test.each([
	{ expected: [0, 0.5], from: -3, moves: [20, 24] },
	{ expected: [0, -0.5], from: 3, moves: [-20, -24] },
])(
	'a drag from $from holds at the detent for the zone past it, then moves on from it',
	({ expected, from, moves }) => {
		expect(drag({ detent: 0, from, moves, spec: detented })).toEqual(expected);
	},
);

test('a drag that starts on the detent has to push through the zone to leave it', () => {
	expect(drag({ detent: 0, from: 0, moves: [7, 12], spec: detented })).toEqual([0, 1]);
});

test('a fine drag that starts on the detent leaves it in the same travel, then moves at the fine pace', () => {
	const moves = [
		{ isFine: true, position: 7 },
		{ isFine: true, position: 20 },
	];

	expect(drag({ detent: 0, from: 0, moves, spec: { max: 180, min: -180, step: 0.1 } })).toEqual([
		0, 2.7,
	]);
});

test.each([
	[-3, -1],
	[3, 5],
])(
	'a drag from %s that never reaches the detent moves as if it were not there',
	(from, expected) => {
		expect(drag({ detent: 0, from, moves: [8], spec: detented })).toEqual([expected]);
	},
);

test('without a detent the same drag passes straight through', () => {
	expect(drag({ from: -3, moves: [20, 24], spec: detented })).toEqual([1.5, 2.5]);
});

test('a press that wobbles under its threshold moves nothing', () => {
	expect(drag({ from: 64, moves: [6, -6], spec: { max: 127 }, thresholdPx: 7 })).toEqual([
		undefined,
		undefined,
	]);
});

test('past the threshold the value catches up with the pointer, and comes back with it', () => {
	expect(drag({ from: 50, moves: [16, 0], thresholdPx: 7 })).toEqual([60, 50]);
});

test('a move out of bounds engages at once', () => {
	expect(drag({ from: 50, moves: [{ isOutside: true, position: 1.6 }] })).toEqual([51]);
});

test('a fine move goes a tenth as far, and Shift let go with the pointer still leaves the value there', () => {
	const spec = { max: 140, min: -20, step: 0.5 };

	expect(drag({ from: 0, moves: [40, { isFine: true, position: 80 }, 80], spec })).toEqual([
		40, 44, 44,
	]);
});

test('a drag from min -0.3 in steps of 0.1 lands exactly on 0', () => {
	expect(drag({ from: -0.3, moves: [48], spec: { max: 0.7, min: -0.3, step: 0.1 } })).toEqual([0]);
});

test('a drag past the end turns back from the end, not from where the pointer went', () => {
	expect(drag({ from: 90, moves: [32, 16] })).toEqual([100, 90]);
});

test.each([
	[362.5, 16, 40],
	[17.5, -16, 340],
])('an endless drag from %s by %ipx crosses the seam to %s', (from, position, expected) => {
	const spec = { isWrapping: true, max: 370, min: 10, step: 7.5 };

	expect(drag({ from, moves: [position], spec })).toEqual([expected]);
});

test('a drag moves by positions evenly along the travel', () => {
	expect(drag({ from: 0.5, moves: [40, 70], spec: { positions: [0.25, 0.5, 1, 2, 4] } })).toEqual([
		1, 2,
	]);
});

test('the threshold itself engages, and a hair under it does not', () => {
	expect(drag({ from: 64, moves: [2.99], spec: { max: 127 } })).toEqual([undefined]);
	expect(drag({ from: 64, moves: [3], spec: { max: 127 } })).toEqual([66]);
});

test('a drag held at the detent that turns back has to push the zone the other way to leave', () => {
	expect(drag({ detent: 0, from: -3, moves: [20, 14, 6, 4], spec: detented })).toEqual([
		0, 0, 0, -0.5,
	]);
});

test.each([
	[10, [-6, -10, -20], [0, 0, 343]],
	[350, [8, 12, 20], [0, 0, 17]],
])(
	'on an endless mapping a drag from %d onto a detent at the seam is held there, then moves on',
	(from, moves, expected) => {
		const endless = { isWrapping: true, max: 360 };

		expect(drag({ detent: 0, from, moves, spec: endless })).toEqual(expected);
	},
);
