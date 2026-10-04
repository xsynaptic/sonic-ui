import type { DragState } from '#lib/drag-step.ts';
import type { ValueMapping } from '#lib/value-mapping.ts';

import { startDrag, stepDrag } from '#lib/drag-step.ts';

export type FieldAxis = 'x' | 'y';

export interface FieldPoint {
	x: number;
	y: number;
}

interface FieldAxisStart {
	from: number;
	mapping: ValueMapping;
	proportion: number;
	travelPx: number;
}

interface FieldStart {
	position: FieldPoint;
	thresholdPx: number;
	x?: FieldAxisStart | undefined;
	y?: FieldAxisStart | undefined;
}

export interface FieldDragState {
	isEngaged: boolean;
	lock: FieldAxis | undefined;
	startPosition: FieldPoint;
	thresholdPx: number;
	x: DragState | undefined;
	y: DragState | undefined;
}

export interface FieldMove extends FieldPoint {
	isFine: boolean;
	isLocked: boolean;
}

export interface FieldMappings {
	x?: undefined | ValueMapping;
	y?: undefined | ValueMapping;
}

interface FieldStep {
	state: FieldDragState;
	x: number | undefined;
	y: number | undefined;
}

interface AxisMove {
	isFine: boolean;
	isHeld: boolean;
	position: number;
}

function startAxis(start: FieldAxisStart | undefined, position: number): DragState | undefined {
	if (!start) return undefined;

	const { mapping, ...rest } = start;

	return startDrag(mapping, { ...rest, position, thresholdPx: 0 });
}

export function startFieldDrag(start: FieldStart): FieldDragState {
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

function dominantAxis(state: FieldDragState, move: FieldPoint): FieldAxis {
	if (!state.x) return 'y';
	if (!state.y) return 'x';

	const { startPosition } = state;

	return Math.abs(move.x - startPosition.x) >= Math.abs(move.y - startPosition.y) ? 'x' : 'y';
}

function stepAxis(
	mapping: undefined | ValueMapping,
	drag: DragState | undefined,
	move: AxisMove,
): { state: DragState | undefined; value: number | undefined } {
	if (!mapping || !drag) return { state: drag, value: undefined };
	if (move.isHeld) return { state: { ...drag, lastPosition: move.position }, value: undefined };

	return stepDrag(mapping, drag, {
		isFine: move.isFine,
		isOutside: false,
		position: move.position,
	});
}

export function stepFieldDrag(
	mappings: FieldMappings,
	state: FieldDragState,
	move: FieldMove,
): FieldStep {
	const { startPosition } = state;
	const isEngaged =
		state.isEngaged ||
		Math.hypot(move.x - startPosition.x, move.y - startPosition.y) >= state.thresholdPx;

	if (!isEngaged) return { state, x: undefined, y: undefined };

	const lock = move.isLocked ? (state.lock ?? dominantAxis(state, move)) : undefined;
	const { isFine } = move;
	const x = stepAxis(mappings.x, state.x, { isFine, isHeld: lock === 'y', position: move.x });
	const y = stepAxis(mappings.y, state.y, { isFine, isHeld: lock === 'x', position: move.y });

	return {
		state: { ...state, isEngaged: true, lock, x: x.state, y: y.state },
		x: x.value,
		y: y.value,
	};
}

export function pointerPosition(event: PointerEvent): FieldPoint {
	return { x: event.clientX, y: -event.clientY };
}

export function pointerMove(event: PointerEvent): FieldMove {
	return { ...pointerPosition(event), isFine: event.shiftKey, isLocked: event.altKey };
}
