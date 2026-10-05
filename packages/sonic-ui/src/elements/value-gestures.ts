import type { DragState } from '#lib/drag-step.ts';
import type { PointerDrag } from '#lib/pointer-drag.ts';
import type { ValueMapping } from '#lib/value-mapping.ts';

import { ReadoutClaim, revealDelay } from '#elements/readout-claim.ts';
import { ValueEntry } from '#elements/value-entry.ts';
import { dragThresholdPx, startDrag, stepDrag } from '#lib/drag-step.ts';
import { focusByPointer } from '#lib/focus-by-pointer.ts';
import { clamp } from '#lib/math.ts';
import { isMenuPress, isResetPress } from '#lib/modifier-press.ts';
import { bindDrag } from '#lib/pointer-drag.ts';
import { readPxProperty } from '#lib/read-px-property.ts';
import { requireChild } from '#lib/render.ts';
import { resetKeys } from '#lib/value-mapping.ts';

export interface ValueAxis {
	fromProportion?: number;
	isKeptOnCancel?: boolean;
	outside?: (event: PointerEvent) => boolean;
	position: (event: PointerEvent) => number;
	travelPx: number;
}

interface GestureHost {
	default: () => number | undefined;
	detent: () => number | undefined;
	dispatch: (type: 'change' | 'sonic-reveal') => void;
	doublePress: () => 'entry' | 'none' | 'reset';
	entryId: string;
	entryText: () => string;
	forwardNaming: (target: Element, isNamed: boolean) => void;
	holdChanged: () => void;
	input: (next: number) => boolean;
	isDisabled: () => boolean;
	keyStep: () => number | undefined;
	land: (target: number, direction: -1 | 0 | 1) => number;
	limit: () => [number, number] | undefined;
	mapping: () => ValueMapping;
	parse: (text: string) => number;
	render: () => void;
	scrubsKeyRepeat: () => boolean;
	springTarget: () => number | undefined;
	tapTarget: () => number | undefined;
	toggleState: (state: string, isOn: boolean) => void;
	value: () => number;
}

interface KeyScrub {
	fromValue: number;
	key: string;
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
	readonly #claim = new ReadoutClaim(() => {
		this.#showRevealed();
		this.#host.holdChanged();
	});

	readonly #control: HTMLElement;

	#entry: undefined | ValueEntry;

	readonly #host: GestureHost;

	#isRevealed = false;

	#keyScrub: KeyScrub | undefined;

	#pointerDrag: PointerDrag<ValueDrag> | undefined;

	#pointerType: string | undefined;

	constructor(host: GestureHost, control: HTMLElement) {
		this.#host = host;
		this.#control = control;
	}

	bind(signal: AbortSignal, grab: (event: PointerEvent) => undefined | ValueAxis): void {
		const control = this.#control;
		const host = this.#host;
		const entry = this.#bindEntry(signal);

		this.#pointerDrag = bindDrag<ValueDrag>(
			control,
			{
				cancel: (drag) => {
					if (drag.isKeptOnCancel !== true) host.input(drag.fromValue);
				},
				grab: (event) => {
					if (isMenuPress(event) || host.isDisabled() || entry.isOpen) return;

					host.toggleState('springing', false);
					// A click listener above makes WebKit send a tap's compatibility mousedown, which blurs the entry a double tap just opened
					if (event.pointerType === 'touch') event.preventDefault();
					focusByPointer(control);
					if (isResetPress(event)) {
						this.#reset();
						return;
					}

					const fromValue = host.value();

					host.toggleState('dragging', true);
					this.#pointerType = event.pointerType;

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
					const tap = drag.state.isEngaged ? undefined : host.tapTarget();

					if (tap !== undefined) {
						entry.forgetPress();
						this.#commit(tap);
						return;
					}
					if (!entry.press(event) || host.springTarget() !== undefined) return;

					const gesture = host.doublePress();

					if (gesture === 'reset') this.#reset();
					else if (gesture === 'entry') entry.open();
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

	end(): void {
		this.#entry?.close(false);
		this.#pointerDrag?.end();
		this.#endKeyScrub();
	}

	heldFrom(): number | undefined {
		return this.#dragging()?.fromValue ?? this.#keyScrub?.fromValue;
	}

	isEditing(): boolean {
		return this.#entry?.isOpen === true;
	}

	isHeld(): boolean {
		return this.#dragging() !== undefined || this.#keyScrub !== undefined;
	}

	isRevealed(): boolean {
		return this.#claim.isRevealed;
	}

	pointerType(): string | undefined {
		return this.#pointerType;
	}

	#bindEntry(signal: AbortSignal): ValueEntry {
		const control = this.#control;
		const host = this.#host;
		const input = requireChild(control, 'input', HTMLInputElement);

		// Chrome's issues panel flags a form field with no id or name; a `name` would submit it
		input.id = host.entryId;

		const entry = new ValueEntry(input, {
			commit: (text) => {
				this.#commit(host.parse(text));
			},
			text: host.entryText,
			toggle: (isOpen) => {
				if (isOpen) host.forwardNaming(input, true);
				host.toggleState('editing', isOpen);
				host.render();
			},
		});

		this.#entry = entry;
		entry.bind(control, signal);

		return entry;
	}

	#bindKeys(entry: ValueEntry, signal: AbortSignal): void {
		const control = this.#control;
		const host = this.#host;

		control.addEventListener(
			'keydown',
			(event) => {
				if (host.isDisabled() || event.defaultPrevented || event.target !== control) return;

				host.toggleState('springing', false);
				if (event.key === 'Enter') {
					if (host.springTarget() !== undefined) return;

					event.preventDefault();
					entry.open();
					return;
				}

				const next = this.#keyTarget(event.key);
				if (next === undefined) return;

				event.preventDefault();
				this.#claim.reveal('keys');
				this.#showRevealed();
				this.#keyTo(event, next);
				host.holdChanged();
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
				if (isMeta || host.mapping().keyTarget(event.key, host.value()) !== undefined) {
					this.#springBack();
				}
			},
			{ signal },
		);
		control.addEventListener(
			'blur',
			() => {
				this.#endKeyScrub();
				this.#concealKeyReveal();
				this.#springBack();
			},
			{ signal },
		);
	}

	#commit(next: number, direction: -1 | 0 | 1 = 0): void {
		const host = this.#host;
		const landed = Number.isFinite(next) ? host.land(next, direction) : next;

		if (host.input(landed)) host.dispatch('change');
	}

	#concealKeyReveal(): void {
		if (!this.#claim.conceal('keys')) return;

		this.#showRevealed();
		this.#host.holdChanged();
	}

	#crossCancelZone(drag: ValueDrag, value: number): void {
		const host = this.#host;
		const isOutside = !drag.isOutside;

		drag.isOutside = isOutside;
		host.toggleState('cancelling', isOutside);
		if (isOutside) this.#renderDragReveal(drag);
		host.input(isOutside ? drag.fromValue : value);
		if (!isOutside) this.#renderDragReveal(drag);
	}

	#dragging(): undefined | ValueDrag {
		return this.#pointerDrag?.current();
	}

	#dragTo(drag: ValueDrag, event: PointerEvent): void {
		const host = this.#host;
		const isOutside = drag.outside?.(event) === true;
		const wasEngaged = drag.state.isEngaged;
		const mapping = host.mapping();
		const { state, value } = stepDrag(mapping, drag.state, {
			isFine: event.shiftKey,
			isOutside,
			position: drag.position(event),
		});

		drag.state = this.#withinLimit(mapping, state);
		if (value === undefined) return;

		if (!wasEngaged) this.#reveal(drag);

		if (isOutside === drag.isOutside) host.input(isOutside ? drag.fromValue : value);
		else this.#crossCancelZone(drag, value);
	}

	#endKeyScrub(): void {
		const host = this.#host;
		const scrub = this.#keyScrub;
		if (!scrub) return;

		this.#keyScrub = undefined;
		host.holdChanged();
		if (host.value() !== scrub.fromValue) host.dispatch('change');
	}

	#keyTarget(key: string): number | undefined {
		const host = this.#host;

		if (resetKeys.has(key)) return host.default();

		return host.mapping().keyTarget(key, host.value(), host.keyStep());
	}

	#keyTo(event: KeyboardEvent, next: number): void {
		const host = this.#host;

		if (event.repeat && host.scrubsKeyRepeat()) {
			this.#scrubKey(event.key, next);
			return;
		}

		this.#endKeyScrub();
		this.#commit(next, next > host.value() ? 1 : -1);
	}

	#releaseDrag(drag: ValueDrag): void {
		const host = this.#host;

		clearTimeout(drag.revealTimer);
		this.#pointerType = undefined;
		this.#claim.conceal('drag');
		host.toggleState('cancelling', false);
		host.holdChanged();
		this.#showRevealed();
		if (host.value() !== drag.fromValue) host.dispatch('change');
		this.#springBack();
	}

	#renderDragReveal(drag: ValueDrag): void {
		const isRevealed = drag.isRevealed && !drag.isOutside;

		if (isRevealed) this.#claim.reveal('drag');
		else this.#claim.conceal('drag');
		this.#host.holdChanged();
		this.#showRevealed();
	}

	#reset(): void {
		this.#commit(this.#host.default() ?? NaN);
	}

	#reveal(drag: ValueDrag): void {
		if (drag.isRevealed || this.#dragging() !== drag) return;

		drag.isRevealed = true;
		this.#renderDragReveal(drag);
	}

	#scrubKey(key: string, next: number): void {
		const host = this.#host;

		if (this.#keyScrub?.key !== key) {
			this.#endKeyScrub();
			this.#keyScrub = { fromValue: host.value(), key };
		}
		host.input(next);
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
		if (host.mapping().snap(target) !== host.value()) host.toggleState('springing', true);
		this.#commit(target);
	}

	#startDrag(axis: ValueAxis, event: PointerEvent): DragState {
		const host = this.#host;
		const mapping = host.mapping();
		const detent = host.detent();
		const value = host.value();
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

	#withinLimit(mapping: ValueMapping, state: DragState): DragState {
		const limit = this.#host.limit();
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
