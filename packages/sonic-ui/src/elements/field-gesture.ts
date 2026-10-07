import type { ReadoutClaim } from '#elements/readout-claim.ts';
import type { FieldAxis, FieldDragState, FieldPoint } from '#lib/field.ts';
import type { ValueModel } from '#lib/value-model.ts';

import { revealDelay } from '#elements/readout-claim.ts';
import { dragThresholdPx } from '#lib/drag-step.ts';
import { pointerMove, pointerPosition, startFieldDrag, stepFieldDrag } from '#lib/field.ts';
import { bindDrag } from '#lib/pointer-drag.ts';

interface FieldAxisHold {
	from?: number;
	model: ValueModel;
	proportion?: number;
	travelPx: number;
}

export interface FieldHold {
	axes: Partial<Record<FieldAxis, FieldAxisHold>>;
	isFlipped?: boolean;
}

export interface FieldInput {
	x?: number | undefined;
	y?: number | undefined;
}

interface FieldGestureOptions<Hold extends FieldHold> {
	claim: ReadoutClaim;
	grab: (event: PointerEvent) => Hold | undefined;
	input: (hold: Hold, next: FieldInput) => void;
	lift?: (hold: Hold, event: PointerEvent) => void;
	release: (hold: Hold, moved: Array<FieldAxis>) => void;
	toggle: (isDragging: boolean) => void;
}

export interface FieldGesture<Hold> {
	current: () => Hold | undefined;
	end: () => void;
	pointerType: () => string | undefined;
}

interface Held<Hold> {
	from: FieldInput;
	hold: Hold;
	state: FieldDragState;
}

const fieldAxes = ['x', 'y'] as const;

function flip<Point extends FieldPoint>(point: Point, hold: FieldHold): Point {
	return hold.isFlipped === true ? { ...point, y: -point.y } : point;
}

function startAxis(hold: FieldAxisHold | undefined) {
	if (!hold) return;

	const { model, travelPx } = hold;
	const mapping = model.mapping();
	const from = model.value;

	return { from, mapping, proportion: hold.proportion ?? mapping.proportionOf(from), travelPx };
}

export function bindFieldGesture<Hold extends FieldHold>(
	target: HTMLElement,
	options: FieldGestureOptions<Hold>,
	signal: AbortSignal,
): FieldGesture<Hold> {
	const { claim } = options;

	let pointerType: string | undefined;

	const drag = bindDrag<Held<Hold>>(
		target,
		{
			cancel: ({ from, hold }) => {
				options.input(hold, from);
			},
			grab: (event) => {
				// Set first, so an `input` the grab itself fires can read it
				pointerType = event.pointerType;

				const hold = options.grab(event);
				if (!hold) {
					pointerType = undefined;
					return;
				}

				const { x, y } = hold.axes;

				claim.press(true, revealDelay(target));

				return {
					from: { x: x?.from ?? x?.model.value, y: y?.from ?? y?.model.value },
					hold,
					state: startFieldDrag({
						position: flip(pointerPosition(event), hold),
						thresholdPx: dragThresholdPx(event.pointerType),
						x: startAxis(x),
						y: startAxis(y),
					}),
				};
			},
			lift: ({ hold }, event) => {
				options.lift?.(hold, event);
			},
			move: (held, event) => {
				const { axes } = held.hold;
				const step = stepFieldDrag(
					{ x: axes.x?.model.mapping(), y: axes.y?.model.mapping() },
					held.state,
					flip(pointerMove(event), held.hold),
				);

				held.state = step.state;
				if (step.state.isEngaged) claim.reveal('drag');
				options.input(held.hold, step);
			},
			release: ({ from, hold }) => {
				claim.press(false);
				options.release(
					hold,
					fieldAxes.filter((axis) => hold.axes[axis]?.model.value !== from[axis]),
				);
				pointerType = undefined;
			},
			toggle: options.toggle,
		},
		signal,
	);

	return { current: () => drag.current()?.hold, end: drag.end, pointerType: () => pointerType };
}
