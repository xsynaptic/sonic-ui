import type { ValueMapping } from '#lib/value-mapping.ts';

import { fineFactor } from '#lib/drag-step.ts';
import { clamp, clampProportion, trimFloat } from '#lib/math.ts';

export interface RegionSpan {
	end: number;
	start: number;
}

export interface RegionDragState {
	from: RegionSpan;
	isEngaged: boolean;
	lastPosition: number;
	startPosition: number;
	thresholdPx: number;
	travelPx: number;
	widthPx: number;
}

interface RegionDragStart {
	from: RegionSpan;
	position: number;
	thresholdPx: number;
	widthPx: number;
}

interface RegionDragStep {
	span: RegionSpan | undefined;
	state: RegionDragState;
}

// A later body is drawn over an earlier one; `undefined` holds the place of one that takes no press
export function regionAt(
	bodies: ReadonlyArray<[number, number] | undefined>,
	x: number,
): number | undefined {
	const index = bodies.findLastIndex((body) => body !== undefined && x >= body[0] && x <= body[1]);

	return index === -1 ? undefined : index;
}

export function regionTravel(
	{ end, start }: RegionSpan,
	[low, high]: [number, number],
): [number, number] {
	return [low, Math.max(low, trimFloat(high - (end - start)))];
}

export function moveRegionTo(mapping: ValueMapping, span: RegionSpan, start: number): RegionSpan {
	const moved = clamp(mapping.snap(start), ...regionTravel(span, mapping.bounds));

	return { end: trimFloat(moved + (span.end - span.start)), start: moved };
}

export function startRegionDrag({ position, ...fixed }: RegionDragStart): RegionDragState {
	return {
		...fixed,
		isEngaged: false,
		lastPosition: position,
		startPosition: position,
		travelPx: 0,
	};
}

// `span` stays `undefined` until the pointer has travelled the threshold, so a lift before then is a press
export function stepRegionDrag(
	mapping: ValueMapping,
	state: RegionDragState,
	move: { isFine: boolean; position: number },
): RegionDragStep {
	const isEngaged =
		state.isEngaged || Math.abs(move.position - state.startPosition) >= state.thresholdPx;
	if (!isEngaged) return { span: undefined, state };

	const pace = move.isFine ? fineFactor : 1;
	const travelPx = state.travelPx + (move.position - state.lastPosition) * pace;
	const at = mapping.proportionOf(state.from.start) + travelPx / state.widthPx;

	return {
		span: moveRegionTo(mapping, state.from, mapping.valueAt(clampProportion(at))),
		state: { ...state, isEngaged: true, lastPosition: move.position, travelPx },
	};
}
