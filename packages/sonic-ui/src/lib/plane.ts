import type { DragState } from '#lib/drag-step.ts';
import type { RangeScale } from '#lib/range-scale.ts';

import { startDrag, stepDrag } from '#lib/drag-step.ts';

export type PlaneAxis = 'x' | 'y';

export interface PlanePoint {
	x: number;
	y: number;
}

interface PlaneAxisStart {
	from: number;
	place: number;
	scale: RangeScale;
	travelPx: number;
}

interface PlaneStart {
	position: PlanePoint;
	thresholdPx: number;
	x?: PlaneAxisStart | undefined;
	y?: PlaneAxisStart | undefined;
}

export interface PlaneDragState {
	isEngaged: boolean;
	lock: PlaneAxis | undefined;
	startPosition: PlanePoint;
	thresholdPx: number;
	x: DragState | undefined;
	y: DragState | undefined;
}

export interface PlaneMove extends PlanePoint {
	isFine: boolean;
	isLocked: boolean;
}

export interface PlaneScales {
	x?: RangeScale | undefined;
	y?: RangeScale | undefined;
}

interface PlaneStep {
	state: PlaneDragState;
	x: number | undefined;
	y: number | undefined;
}

interface AxisMove {
	isFine: boolean;
	isHeld: boolean;
	position: number;
}

function startAxis(start: PlaneAxisStart | undefined, position: number): DragState | undefined {
	if (!start) return undefined;

	const { scale, ...rest } = start;

	return startDrag(scale, { ...rest, position, thresholdPx: 0 });
}

export function startPlaneDrag(start: PlaneStart): PlaneDragState {
	const { position, thresholdPx } = start;

	return {
		isEngaged: false,
		lock: undefined,
		startPosition: position,
		thresholdPx,
		x: startAxis(start.x, position.x),
		y: startAxis(start.y, position.y),
	};
}

function dominantAxis(state: PlaneDragState, move: PlanePoint): PlaneAxis {
	if (!state.x) return 'y';
	if (!state.y) return 'x';

	const { startPosition } = state;

	return Math.abs(move.x - startPosition.x) >= Math.abs(move.y - startPosition.y) ? 'x' : 'y';
}

function stepAxis(
	scale: RangeScale | undefined,
	drag: DragState | undefined,
	move: AxisMove,
): { state: DragState | undefined; value: number | undefined } {
	if (!scale || !drag) return { state: drag, value: undefined };
	if (move.isHeld) return { state: { ...drag, lastPosition: move.position }, value: undefined };

	return stepDrag(scale, drag, { isFine: move.isFine, isOutside: false, position: move.position });
}

export function stepPlaneDrag(
	scales: PlaneScales,
	state: PlaneDragState,
	move: PlaneMove,
): PlaneStep {
	const { startPosition } = state;
	const isEngaged =
		state.isEngaged ||
		Math.hypot(move.x - startPosition.x, move.y - startPosition.y) >= state.thresholdPx;

	if (!isEngaged) return { state, x: undefined, y: undefined };

	const lock = move.isLocked ? (state.lock ?? dominantAxis(state, move)) : undefined;
	const { isFine } = move;
	const x = stepAxis(scales.x, state.x, { isFine, isHeld: lock === 'y', position: move.x });
	const y = stepAxis(scales.y, state.y, { isFine, isHeld: lock === 'x', position: move.y });

	return {
		state: { ...state, isEngaged: true, lock, x: x.state, y: y.state },
		x: x.value,
		y: y.value,
	};
}

export function pointerPosition(event: PointerEvent): PlanePoint {
	return { x: event.clientX, y: -event.clientY };
}

export function pointerMove(event: PointerEvent): PlaneMove {
	return { ...pointerPosition(event), isFine: event.shiftKey, isLocked: event.altKey };
}
