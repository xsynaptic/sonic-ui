import type { RangeScale } from '#lib/range-scale.ts';

import { clampUnit, wrapUnit } from '#lib/math.ts';

interface DetentHold {
	place: number;
	slack: number | undefined;
	value: number;
	zone: number;
}

export interface DragState {
	detent?: DetentHold;
	isEngaged: boolean;
	lastPosition: number;
	rawPlace: number;
	startPosition: number;
	thresholdPx: number;
	travelPx: number;
}

export interface DragMove {
	isFine: boolean;
	isOutside: boolean;
	position: number;
}

interface DragStart {
	detent?: { value: number; zone: number };
	from: number;
	place: number;
	position: number;
	thresholdPx: number;
	travelPx: number;
}

interface DragStep {
	state: DragState;
	value: number | undefined;
}

const fineScale = 0.1;
const mouseDragThresholdPx = 3;
const touchDragThresholdPx = 7;

export function dragThresholdPx(pointerType: string): number {
	return pointerType === 'touch' ? touchDragThresholdPx : mouseDragThresholdPx;
}

function isAcross(from: number, to: number, place: number): boolean {
	return from !== place && (from - place) * (to - place) <= 0;
}

function passDetent(
	hold: DetentHold,
	from: number,
	to: number,
): { place: number | undefined; slack: number | undefined } {
	if (hold.slack === undefined && !isAcross(from, to, hold.place)) {
		return { place: to, slack: undefined };
	}

	const slack = (hold.slack ?? 0) + to - hold.place;

	if (Math.abs(slack) <= hold.zone) return { place: undefined, slack };

	return { place: hold.place + slack - Math.sign(slack) * hold.zone, slack: undefined };
}

function land(scale: RangeScale, state: DragState, place: number): DragStep {
	const rawPlace = scale.isWrapping ? wrapUnit(place) : clampUnit(place);

	return {
		state: { ...state, rawPlace },
		value: scale.snap(scale.valueAt(rawPlace)),
	};
}

export function startDrag(scale: RangeScale, start: DragStart): DragState {
	const { detent: wanted, from, place, position, ...fixed } = start;
	const state = {
		...fixed,
		isEngaged: false,
		lastPosition: position,
		rawPlace: place,
		startPosition: position,
	};
	if (!wanted) return state;

	const value = scale.snap(wanted.value);
	const detent = {
		place: scale.place(value),
		slack: value === from ? 0 : undefined,
		value,
		zone: wanted.zone,
	};

	return { ...state, detent };
}

export function stepDrag(scale: RangeScale, state: DragState, move: DragMove): DragStep {
	const isEngaged =
		state.isEngaged ||
		move.isOutside ||
		Math.abs(move.position - state.startPosition) >= state.thresholdPx;

	if (!isEngaged) return { state, value: undefined };

	const pace = move.isFine ? fineScale : 1;
	const to = state.rawPlace + ((move.position - state.lastPosition) / state.travelPx) * pace;
	const moved = { ...state, isEngaged: true, lastPosition: move.position };
	const { detent } = state;
	if (!detent) return land(scale, moved, to);

	const passed = passDetent(detent, state.rawPlace, to);
	const held = { ...moved, detent: { ...detent, slack: passed.slack } };
	if (passed.place === undefined) {
		return { state: { ...held, rawPlace: detent.place }, value: detent.value };
	}

	return land(scale, held, passed.place);
}
