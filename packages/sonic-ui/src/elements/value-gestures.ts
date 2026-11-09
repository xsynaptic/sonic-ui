import type { ValueReason } from '#elements/value-event.ts';
import type { DragState } from '#lib/drag-step.ts';
import type { PointerDrag } from '#lib/pointer-drag.ts';
import type { RepeatPress } from '#lib/repeat-press.ts';
import type { ValueMapping } from '#lib/value-mapping.ts';
import type { ValueModel } from '#lib/value-model.ts';

import { ReadoutClaim, revealDelay } from '#elements/readout-claim.ts';
import { ValueEntry } from '#elements/value-entry.ts';
import { dragThresholdPx, startDrag, stepDrag } from '#lib/drag-step.ts';
import { focusByPointer } from '#lib/focus-by-pointer.ts';
import { clamp } from '#lib/math.ts';
import { isMenuPress, isResetPress } from '#lib/modifier-press.ts';
import { bindDrag } from '#lib/pointer-drag.ts';
import { readPxProperty } from '#lib/read-px-property.ts';
import { requireChild } from '#lib/render.ts';
import { bindRepeatPress } from '#lib/repeat-press.ts';
import { resetKeys } from '#lib/value-mapping.ts';

export interface ValueAxis {
	fromProportion?: number;
	isKeptOnCancel?: boolean;
	outside?: (event: PointerEvent) => boolean;
	position: (event: PointerEvent) => number;
	travelPx: number;
}

interface GestureHost {
	change: (reason: ValueReason) => void;
	default: () => number | undefined;
	detent: () => number | undefined;
	dispatch: (type: 'sonic-reveal') => void;
	doublePress: () => 'entry' | 'none' | 'reset';
	entryId: string;
	entryText: () => string;
	forwardNaming: (target: Element, isNamed: boolean) => void;
	hasEntry: () => boolean;
	input: (next: number, reason: ValueReason) => boolean;
	isDisabled: () => boolean;
	keyStep: () => number | undefined;
	model: ValueModel;
	parse: (text: string) => number;
	render: () => void;
	scrubChanged: () => void;
	scrubsKeyRepeat: () => boolean;
	springTarget: () => number | undefined;
	tapTarget: () => number | undefined;
	toggleState: (state: string, isOn: boolean) => void;
}

interface ArrowPart {
	isAccelerating: () => boolean;
	key: string;
}

interface KeyScrub {
	fromValue: number;
	key: string;
	reason: ValueReason;
}

interface ValueDrag extends ValueAxis {
	fromValue: number;
	isOutside: boolean;
	isRevealed: boolean;
	revealTimer: ReturnType<typeof setTimeout> | undefined;
	state: DragState;
}

const detentZonePx = 8;

export class ValueGestures {
	#arrowFrom: number | undefined;

	readonly #arrows: Array<{ part: HTMLElement; press: RepeatPress }> = [];

	readonly #claim = new ReadoutClaim(() => {
		this.#showRevealed();
		this.#host.scrubChanged();
	});

	readonly #control: HTMLElement;

	#entry: undefined | ValueEntry;

	// The part that holds focus, the role and the keys; the control itself on all but the strip
	readonly #focus: HTMLElement;

	readonly #host: GestureHost;

	#isRevealed = false;

	#keyScrub: KeyScrub | undefined;

	#pointerDrag: PointerDrag<ValueDrag> | undefined;

	#pointerType: string | undefined;

	constructor(host: GestureHost, control: HTMLElement, focus: HTMLElement) {
		this.#host = host;
		this.#control = control;
		this.#focus = focus;
	}

	abandon(): void {
		const drag = this.#dragging();
		if (!drag) return;

		this.#host.input(drag.fromValue, 'drag');
		this.#entry?.forgetPress();
		this.#pointerDrag?.end();
	}

	bind(signal: AbortSignal, grab: (event: PointerEvent) => undefined | ValueAxis): void {
		const control = this.#control;
		const host = this.#host;
		const entry = this.#bindEntry(signal);

		this.#pointerDrag = bindDrag<ValueDrag>(
			control,
			{
				cancel: (drag) => {
					if (drag.isKeptOnCancel !== true) host.input(drag.fromValue, 'drag');
				},
				grab: (event) => {
					if (this.#isOnArrow(event)) return;

					this.#endArrows();
					if (isMenuPress(event) || host.isDisabled() || entry.isOpen) return;

					host.toggleState('springing', false);
					// A click listener above makes WebKit send a tap's compatibility mousedown, which blurs the entry a double tap just opened
					if (event.pointerType === 'touch') event.preventDefault();
					focusByPointer(this.#focus);
					this.#pointerType = event.pointerType;
					if (isResetPress(event)) {
						this.#reset();
						this.#pointerType = undefined;
						return;
					}

					const fromValue = host.model.value;

					host.toggleState('dragging', true);

					const axis = grab(event);
					if (!axis) {
						host.toggleState('dragging', false);
						this.#pointerType = undefined;
						return;
					}

					const drag: ValueDrag = {
						...axis,
						fromValue,
						isOutside: false,
						isRevealed: false,
						revealTimer: undefined,
						state: this.#startDrag(axis, event),
					};

					drag.revealTimer = setTimeout(() => {
						this.#reveal(drag);
					}, revealDelay(control));

					return drag;
				},
				lift: (drag, event) => {
					this.#pointerType = event.pointerType;
					this.#lift(drag, event, entry);
					this.#pointerType = undefined;
				},
				move: (drag, event) => {
					this.#dragTo(drag, event);
				},
				release: (drag) => {
					this.#releaseDrag(drag);
				},
				toggle: (isDragging) => {
					host.toggleState('dragging', isDragging);
				},
			},
			signal,
		);
		control.addEventListener(
			'pointercancel',
			() => {
				entry.forgetPress();
			},
			{ signal },
		);
		this.#bindKeys(entry, signal);
		signal.addEventListener(
			'abort',
			() => {
				this.#endKeyScrub();
				this.#concealKeyReveal();
			},
			{ once: true },
		);
	}

	bindArrow(part: HTMLElement, arrow: ArrowPart, signal: AbortSignal): void {
		const { isAccelerating, key } = arrow;
		const host = this.#host;

		this.#arrows.push({
			part,
			press: bindRepeatPress(
				part,
				{
					press: (event) => {
						if (isMenuPress(event) || host.isDisabled() || this.isEditing() || this.isHeld()) {
							return false;
						}

						host.toggleState('springing', false);
						focusByPointer(this.#focus);
						this.#arrowFrom = host.model.value;
						part.toggleAttribute('data-sonic-pressed', true);

						return true;
					},
					release: () => {
						const from = this.#arrowFrom;

						this.#arrowFrom = undefined;
						part.toggleAttribute('data-sonic-pressed', false);
						if (host.model.value !== from) host.change('arrow');
					},
					step: (steps) => this.#stepArrow(key, isAccelerating() ? steps : 1),
				},
				signal,
			),
		});
	}

	end(): void {
		this.#entry?.close(false);
		this.#pointerDrag?.end();
		this.#endKeyScrub();
		this.#endArrows();
	}

	isEditing(): boolean {
		return this.#entry?.isOpen === true;
	}

	isHeld(): boolean {
		return (
			this.#dragging() !== undefined ||
			this.#keyScrub !== undefined ||
			this.#arrowFrom !== undefined
		);
	}

	isRevealed(): boolean {
		return this.#claim.isRevealed;
	}

	pointerType(): string | undefined {
		return this.#pointerType;
	}

	reset(): void {
		this.#reset();
	}

	scrubFrom(): number | undefined {
		return this.#dragging()?.fromValue ?? this.#keyScrub?.fromValue;
	}

	#bindEntry(signal: AbortSignal): ValueEntry {
		const control = this.#control;
		const host = this.#host;
		const input = requireChild(control, 'input', HTMLInputElement);

		// Chrome's issues panel flags a form field with no id or name; a `name` would submit it
		input.id = host.entryId;

		const entry = new ValueEntry(input, {
			commit: (text) => {
				this.#commit(host.parse(text), 'entry');
			},
			text: host.entryText,
			toggle: (isOpen) => {
				if (isOpen) host.forwardNaming(input, true);
				host.toggleState('editing', isOpen);
				host.render();
			},
		});

		this.#entry = entry;
		entry.bind(this.#focus, signal);

		return entry;
	}

	#bindKeys(entry: ValueEntry, signal: AbortSignal): void {
		const control = this.#control;
		const host = this.#host;

		control.addEventListener(
			'keydown',
			(event) => {
				if (this.#ignoresKey(event)) return;

				host.toggleState('springing', false);
				if (event.key === 'Enter') {
					if (host.springTarget() !== undefined || !host.hasEntry()) return;

					event.preventDefault();
					entry.open();
					return;
				}

				const next = this.#keyTarget(event.key);
				if (next === undefined) return;

				event.preventDefault();
				this.#claim.reveal('keys');
				this.#showRevealed();
				this.#keyTo(event, next, resetKeys.has(event.key) ? 'reset' : 'key');
				host.scrubChanged();
			},
			{ signal },
		);
		control.addEventListener(
			'keyup',
			(event) => {
				// macOS sends no `keyup` for a key let go while Cmd is down
				const isMeta = event.key === 'Meta';

				if (isMeta || event.key === this.#keyScrub?.key) this.#endKeyScrub();
				if (isMeta && this.#dragging()) return;
				if (isMeta || host.model.mapping().keyTarget(event.key, host.model.value) !== undefined) {
					this.#springBack();
				}
			},
			{ signal },
		);
		this.#focus.addEventListener(
			'blur',
			() => {
				this.#endKeyScrub();
				this.#concealKeyReveal();
				this.#springBack();
			},
			{ signal },
		);
	}

	#commit(next: number, reason: ValueReason, direction: -1 | 0 | 1 = 0): void {
		const host = this.#host;
		const landed = Number.isFinite(next) ? host.model.land(next, direction) : next;

		if (host.input(landed, reason)) host.change(reason);
	}

	#concealKeyReveal(): void {
		if (!this.#claim.conceal('keys')) return;

		this.#showRevealed();
		this.#host.scrubChanged();
	}

	#crossCancelZone(drag: ValueDrag, value: number): void {
		const host = this.#host;
		const isOutside = !drag.isOutside;

		drag.isOutside = isOutside;
		host.toggleState('cancelling', isOutside);
		if (isOutside) this.#renderDragReveal(drag);
		host.input(isOutside ? drag.fromValue : value, 'drag');
		if (!isOutside) this.#renderDragReveal(drag);
	}

	#dragging(): undefined | ValueDrag {
		return this.#pointerDrag?.current();
	}

	#dragTo(drag: ValueDrag, event: PointerEvent): void {
		const host = this.#host;
		const isOutside = drag.outside?.(event) === true;
		const wasEngaged = drag.state.isEngaged;
		const mapping = host.model.mapping();
		const { state, value } = stepDrag(mapping, drag.state, {
			isFine: event.shiftKey,
			isOutside,
			position: drag.position(event),
		});

		drag.state = this.#withinLimit(mapping, state);
		if (value === undefined) return;

		if (!wasEngaged) this.#reveal(drag);

		if (isOutside === drag.isOutside) host.input(isOutside ? drag.fromValue : value, 'drag');
		else this.#crossCancelZone(drag, value);
	}

	#endArrows(): void {
		for (const { press } of this.#arrows) press.end();
	}

	#endKeyScrub(): void {
		const host = this.#host;
		const scrub = this.#keyScrub;
		if (!scrub) return;

		this.#keyScrub = undefined;
		host.scrubChanged();
		if (host.model.value !== scrub.fromValue) host.change(scrub.reason);
	}

	#ignoresKey(event: KeyboardEvent): boolean {
		if (this.#host.isDisabled() || event.defaultPrevented) return true;

		return event.target !== this.#focus || this.#arrowFrom !== undefined;
	}

	#isOnArrow(event: PointerEvent): boolean {
		const { target } = event;

		return target instanceof Node && this.#arrows.some(({ part }) => part.contains(target));
	}

	#keyTarget(key: string): number | undefined {
		const host = this.#host;

		if (resetKeys.has(key)) return host.default();

		return host.model.mapping().keyTarget(key, host.model.value, host.keyStep());
	}

	#keyTo(event: KeyboardEvent, next: number, reason: ValueReason): void {
		const host = this.#host;

		if (event.repeat && host.scrubsKeyRepeat()) {
			this.#scrubKey({ fromValue: host.model.value, key: event.key, reason }, next);
			return;
		}

		this.#endKeyScrub();
		this.#commit(next, reason, next > host.model.value ? 1 : -1);
	}

	#lift(drag: ValueDrag, event: PointerEvent, entry: ValueEntry): void {
		const host = this.#host;
		const tap = drag.state.isEngaged ? undefined : host.tapTarget();

		if (tap !== undefined) {
			entry.forgetPress();
			this.#commit(tap, 'tap');
			return;
		}
		if (!entry.press(event) || host.springTarget() !== undefined) return;

		const gesture = host.doublePress();

		if (gesture === 'reset') this.#reset();
		else if (gesture === 'entry' && host.hasEntry()) entry.open();
	}

	#releaseDrag(drag: ValueDrag): void {
		const host = this.#host;

		clearTimeout(drag.revealTimer);
		this.#claim.conceal('drag');
		host.toggleState('cancelling', false);
		host.scrubChanged();
		this.#showRevealed();
		if (host.model.value !== drag.fromValue) host.change('drag');
		this.#springBack();
		this.#pointerType = undefined;
	}

	#renderDragReveal(drag: ValueDrag): void {
		const isRevealed = drag.isRevealed && !drag.isOutside;

		if (isRevealed) this.#claim.reveal('drag');
		else this.#claim.conceal('drag');
		this.#host.scrubChanged();
		this.#showRevealed();
	}

	#reset(): void {
		this.#commit(this.#host.default() ?? NaN, 'reset');
	}

	#reveal(drag: ValueDrag): void {
		if (drag.isRevealed || this.#dragging() !== drag) return;

		drag.isRevealed = true;
		this.#renderDragReveal(drag);
	}

	#scrubKey(scrub: KeyScrub, next: number): void {
		if (this.#keyScrub?.key !== scrub.key) {
			this.#endKeyScrub();
			this.#keyScrub = scrub;
		}
		this.#host.input(next, scrub.reason);
	}

	#showRevealed(): void {
		const { isRevealed } = this.#claim;
		if (isRevealed === this.#isRevealed) return;

		this.#isRevealed = isRevealed;
		this.#host.toggleState('revealed', isRevealed);
		this.#host.dispatch('sonic-reveal');
	}

	#springBack(): void {
		const host = this.#host;
		const target = host.springTarget();
		if (target === undefined) return;

		// Set before the commit so a `change` listener reading styles sees the glide
		if (host.model.mapping().snap(target) !== host.model.value) host.toggleState('springing', true);
		this.#commit(target, 'spring');
	}

	#startDrag(axis: ValueAxis, event: PointerEvent): DragState {
		const host = this.#host;
		const mapping = host.model.mapping();
		const detent = host.detent();
		const value = host.model.value;
		const start = {
			from: value,
			position: axis.position(event),
			proportion: axis.fromProportion ?? mapping.proportionOf(value),
			thresholdPx: dragThresholdPx(event.pointerType),
			travelPx: axis.travelPx,
		};
		if (detent === undefined) return startDrag(mapping, start);

		const zonePx = readPxProperty(
			getComputedStyle(this.#control),
			'--_sonic-detent-zone',
			detentZonePx,
		);

		return startDrag(mapping, {
			...start,
			detent: { value: detent, zone: zonePx / axis.travelPx },
		});
	}

	#stepArrow(key: string, steps: number): boolean {
		const host = this.#host;
		const mapping = host.model.mapping();
		const from = host.model.value;
		const detent = host.detent();
		const caught = detent === undefined ? undefined : mapping.snap(detent);
		let next = from;

		for (let step = 0; step < steps; step++) {
			const target = mapping.keyTarget(key, next, host.keyStep());
			if (target === undefined || target === next) break;

			next = target;
			if (next === caught) break;
		}
		if (next === from) return false;

		return host.input(host.model.land(next, next > from ? 1 : -1), 'arrow');
	}

	#withinLimit(mapping: ValueMapping, state: DragState): DragState {
		const limit = this.#host.model.limit();
		if (!limit || mapping.isWrapping) return state;

		const [low, high] = limit;

		return {
			...state,
			rawProportion: clamp(
				state.rawProportion,
				mapping.proportionOf(low),
				mapping.proportionOf(high),
			),
		};
	}
}
