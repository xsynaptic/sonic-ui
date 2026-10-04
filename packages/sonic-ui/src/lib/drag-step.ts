import type { ValueMapping } from '#lib/value-mapping.ts';

import { clampProportion, wrapProportion } from '#lib/math.ts';

interface DetentHold {
	proportion: number;
	slack: number | undefined;
	value: number;
	zone: number;
}

export interface DragState {
	detent?: DetentHold;
	isEngaged: boolean;
	lastPosition: number;
	rawProportion: number;
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
	position: number;
	proportion: number;
	thresholdPx: number;
	travelPx: number;
}

interface DragStep {
	state: DragState;
	value: number | undefined;
}

const fineFactor = 0.1;
const mouseDragThresholdPx = 3;
const touchDragThresholdPx = 7;

export function dragThresholdPx(pointerType: string): number {
	return pointerType === 'touch' ? touchDragThresholdPx : mouseDragThresholdPx;
}

function isAcross(from: number, to: number, proportion: number): boolean {
	return from !== proportion && (from - proportion) * (to - proportion) <= 0;
}

function passDetent(
	hold: DetentHold,
	from: number,
	to: number,
): { proportion: number | undefined; slack: number | undefined } {
	if (hold.slack === undefined && !isAcross(from, to, hold.proportion)) {
		return { proportion: to, slack: undefined };
	}

	const slack = (hold.slack ?? 0) + to - hold.proportion;

	if (Math.abs(slack) <= hold.zone) return { proportion: undefined, slack };

	return { proportion: hold.proportion + slack - Math.sign(slack) * hold.zone, slack: undefined };
}

function nearestTurn(hold: DetentHold, from: number): DetentHold {
	return { ...hold, proportion: hold.proportion + Math.round(from - hold.proportion) };
}

function land(mapping: ValueMapping, state: DragState, proportion: number): DragStep {
	const rawProportion = mapping.isWrapping
		? wrapProportion(proportion)
		: clampProportion(proportion);

	return {
		state: { ...state, rawProportion },
		value: mapping.snap(mapping.valueAt(rawProportion)),
	};
}

export function startDrag(mapping: ValueMapping, start: DragStart): DragState {
	const { detent: wanted, from, position, proportion, ...fixed } = start;
	const state = {
		...fixed,
		isEngaged: false,
		lastPosition: position,
		rawProportion: proportion,
		startPosition: position,
	};
	if (!wanted) return state;

	const value = mapping.snap(wanted.value);
	const detent = {
		proportion: mapping.proportionOf(value),
		slack: value === from ? 0 : undefined,
		value,
		zone: wanted.zone,
	};

	return { ...state, detent };
}

export function stepDrag(mapping: ValueMapping, state: DragState, move: DragMove): DragStep {
	const isEngaged =
		state.isEngaged ||
		move.isOutside ||
		Math.abs(move.position - state.startPosition) >= state.thresholdPx;

	if (!isEngaged) return { state, value: undefined };

	const pace = move.isFine ? fineFactor : 1;
	const to = state.rawProportion + ((move.position - state.lastPosition) / state.travelPx) * pace;
	const moved = { ...state, isEngaged: true, lastPosition: move.position };
	const { detent } = state;
	if (!detent) return land(mapping, moved, to);

	const near = mapping.isWrapping ? nearestTurn(detent, state.rawProportion) : detent;
	const passed = passDetent(near, state.rawProportion, to);
	const held = { ...moved, detent: { ...detent, slack: passed.slack } };
	if (passed.proportion === undefined) {
		return { state: { ...held, rawProportion: detent.proportion }, value: detent.value };
	}

	return land(mapping, held, passed.proportion);
}
