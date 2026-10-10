import type { FieldAxis, FieldDragState, FieldPoint } from '#lib/field.ts';
import type { ValueModel } from '#lib/value-model.ts';

import { ReadoutClaim, revealDelay } from '#elements/readout-claim.ts';
import { createDoublePress } from '#lib/double-press.ts';
import { dragThresholdPx } from '#lib/drag-step.ts';
import { pointerMove, pointerPosition, startFieldDrag, stepFieldDrag } from '#lib/field.ts';
import { isMenuPress, isResetPress } from '#lib/modifier-press.ts';
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

interface RevealOptions {
	element: HTMLElement;
	renderReadout: () => void;
	toggle: (state: 'dragging' | 'revealed', isOn: boolean) => void;
}

interface FieldGestureOptions<Hold extends FieldHold> extends RevealOptions {
	grab: (event: PointerEvent) => Hold | undefined;
	input: (hold: Hold, next: FieldInput) => void;
	release: (hold: Hold, moved: Array<FieldAxis>) => void;
	reset?: () => void;
	resetsOnDoublePress?: () => boolean;
}

export interface FieldGesture<Hold> {
	concealKeys: () => void;
	current: () => Hold | undefined;
	end: () => void;
	isRevealed: () => boolean;
	pointerType: () => string | undefined;
	revealKeys: () => void;
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

function createReveal({ element, renderReadout, toggle }: RevealOptions) {
	let isRevealed = false;

	const show = (): void => {
		if (claim.isRevealed !== isRevealed) {
			isRevealed = claim.isRevealed;
			toggle('revealed', isRevealed);
			element.dispatchEvent(new Event('sonic-reveal', { bubbles: true }));
		}
		renderReadout();
	};
	const claim = new ReadoutClaim(show);

	return { claim, show };
}

export function bindFieldGesture<Hold extends FieldHold>(
	target: HTMLElement,
	options: FieldGestureOptions<Hold>,
	signal: AbortSignal,
): FieldGesture<Hold> {
	const { reset, resetsOnDoublePress } = options;
	const { claim, show } = createReveal(options);
	const doublePress = reset && resetsOnDoublePress ? createDoublePress() : undefined;

	let pointerType: string | undefined;

	const grab = (event: PointerEvent): Hold | undefined => {
		if (isMenuPress(event)) return undefined;
		if (!reset || !isResetPress(event)) return options.grab(event);

		reset();

		return undefined;
	};

	const drag = bindDrag<Held<Hold>>(
		target,
		{
			cancel: ({ from, hold }) => {
				options.input(hold, from);
			},
			grab: (event) => {
				// Set first, so an `input` the grab itself fires can read it
				pointerType = event.pointerType;

				const hold = grab(event);
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
			lift: (_held, event) => {
				if (doublePress?.press(event) === true && resetsOnDoublePress?.() === true) reset?.();
			},
			move: (held, event) => {
				const { axes } = held.hold;
				const step = stepFieldDrag(
					{ x: axes.x?.model.mapping(), y: axes.y?.model.mapping() },
					held.state,
					flip(pointerMove(event), held.hold),
				);

				held.state = step.state;
				if (step.state.isEngaged) {
					claim.reveal('drag');
					show();
				}
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
			toggle: (isDragging) => {
				options.toggle('dragging', isDragging);
			},
		},
		signal,
	);

	target.addEventListener(
		'pointercancel',
		() => {
			doublePress?.forget();
		},
		{ signal },
	);

	return {
		concealKeys: () => {
			if (claim.conceal('keys')) show();
		},
		current: () => drag.current()?.hold,
		end: drag.end,
		isRevealed: () => claim.isRevealed,
		pointerType: () => pointerType,
		revealKeys: () => {
			claim.reveal('keys');
			show();
		},
	};
}
