import type { DragState } from '#lib/drag-step.ts';
import type { PointerDrag } from '#lib/pointer-drag.ts';
import type { TimeRegions } from '#lib/time-regions.ts';
import type { ValueMapping } from '#lib/value-mapping.ts';

import { SonicFormElement } from '#elements/form-element.ts';
import { ReadoutClaim, revealMs } from '#elements/readout-claim.ts';
import { Readout } from '#elements/readout.ts';
import { ValueEntry } from '#elements/value-entry.ts';
import { copyNode } from '#lib/copy-node.ts';
import { dragThresholdPx, startDrag, stepDrag } from '#lib/drag-step.ts';
import { focusByPointer } from '#lib/focus-by-pointer.ts';
import { clamp } from '#lib/math.ts';
import { isMenuPress, isResetPress } from '#lib/modifier-press.ts';
import { parseNumberList } from '#lib/number-list.ts';
import { bindDrag } from '#lib/pointer-drag.ts';
import { readPxProperty } from '#lib/read-px-property.ts';
import { placeChildren, requireChild } from '#lib/render.ts';
import { readRegions } from '#lib/time-regions.ts';
import { resetKeys, valueMapping } from '#lib/value-mapping.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

export interface ValueAxis {
	fromProportion?: number;
	isKeptOnCancel?: boolean;
	outside?: (event: PointerEvent) => boolean;
	position: (event: PointerEvent) => number;
	travelPx: number;
}

interface ValueDrag extends ValueAxis {
	fromValue: number;
	isOutside: boolean;
	isRevealed: boolean;
	revealTimer: ReturnType<typeof setTimeout> | undefined;
	state: DragState;
}

interface KeyScrub {
	fromValue: number;
	key: string;
}

const detentZonePx = 8;
const fallbackTravelPx = 160;

let instanceCount = 0;

const proportionAttributes = new Set(['max', 'midpoint', 'min', 'notched', 'positions', 'taper']);

const roleAttributes = [
	'aria-disabled',
	'aria-orientation',
	'aria-valuemax',
	'aria-valuemin',
	'aria-valuenow',
	'aria-valuetext',
	'role',
	'tabindex',
];

type ScaleMark = HTMLElement | SVGElement;

function scaleValue(mark: ScaleMark): number {
	const text = mark.dataset.sonicValue?.trim();

	return text ? Number(text) : NaN;
}

function scaleMark(original: ChildNode): ScaleMark | undefined {
	const mark = copyNode(original);
	if (!(mark instanceof HTMLElement || mark instanceof SVGElement)) return undefined;
	if (!Number.isFinite(scaleValue(mark))) return undefined;

	const isTick = mark.childElementCount === 0 && mark.textContent.trim() === '';

	mark.classList.add(isTick ? 'sonic-scale-tick' : 'sonic-scale-label');

	return mark;
}

type ValueLanding = (target: number, direction: -1 | 0 | 1) => number;

export interface ValueLink {
	input: (next: number, isMover?: boolean) => boolean;
	isDisabled: () => boolean;
	isHeld: () => boolean;
	land: (resolve: undefined | ValueLanding) => void;
	limit: (bounds: [number, number] | undefined) => void;
	mapping: () => ValueMapping;
	value: () => number;
	watch: (listener: () => void) => () => void;
}

// Filled from inside the class, so it reaches protected members and nothing lands on the element's public type
let link: (element: SonicValueElement) => ValueLink;

export function linkValue(element: SonicValueElement): ValueLink {
	return link(element);
}

export abstract class SonicValueElement extends SonicFormElement {
	static override readonly observedAttributes = [
		...SonicFormElement.observedAttributes,
		'detent',
		'max',
		'midpoint',
		'min',
		'notched',
		'origin',
		'readout',
		'step',
		'taper',
		'value',
		'positions',
	];

	static {
		link = (element) => ({
			input: (next, isMover = false) => (isMover || !element.#isHeld()) && element.input(next),
			isDisabled: () => element.isDisabled(),
			isHeld: () => element.#isHeld(),
			land: (resolve) => {
				element.#land = resolve;
			},
			limit: (bounds) => {
				element.#limit = bounds;
			},
			mapping: () => element.mapping(),
			value: () => element.#value,
			watch: (listener) => {
				element.#watchers.add(listener);

				return () => {
					element.#watchers.delete(listener);
				};
			},
		});
	}

	get buffered(): Array<[number, number]> {
		return this.#buffered.map(([start, end]) => [start, end]);
	}

	set buffered(regions: TimeRegions | undefined) {
		this.#buffered = regions
			? readRegions(regions).toSorted((first, second) => first[0] - second[0])
			: [];
		this.render();
	}

	get default(): number | undefined {
		return this.optionalNumberAttribute('default');
	}

	set default(value: number | undefined) {
		this.reflect('default', value);
	}

	get detent(): number | undefined {
		return this.optionalNumberAttribute('detent');
	}

	set detent(value: number | undefined) {
		this.reflect('detent', value);
	}

	get dimmed(): boolean {
		return this.hasAttribute('dimmed');
	}

	set dimmed(isDimmed: boolean) {
		this.reflect('dimmed', isDimmed);
	}

	get doublePress(): 'entry' | 'reset' {
		return this.getAttribute('double-press') === 'reset' ? 'reset' : 'entry';
	}

	set doublePress(gesture: 'entry' | 'reset' | undefined) {
		this.reflect('double-press', gesture);
	}

	get formatSpokenValue(): ((value: number) => string) | undefined {
		return this.#formatSpokenValue;
	}

	set formatSpokenValue(format: ((value: number) => string) | undefined) {
		this.#formatSpokenValue = format;
		this.render();
	}

	get formatValue(): ((value: number) => string) | undefined {
		return this.#formatValue;
	}

	set formatValue(format: ((value: number) => string) | undefined) {
		this.#formatValue = format;
		this.render();
	}

	get keyStep(): number | undefined {
		return this.optionalNumberAttribute('key-step');
	}

	set keyStep(value: number | undefined) {
		this.reflect('key-step', value);
	}

	get max(): number {
		return this.numberAttribute('max', 100);
	}

	set max(value: number | undefined) {
		this.reflect('max', value);
	}

	get midpoint(): number | undefined {
		return this.optionalNumberAttribute('midpoint');
	}

	set midpoint(value: number | undefined) {
		this.reflect('midpoint', value);
	}

	get min(): number {
		return this.numberAttribute('min', 0);
	}

	set min(value: number | undefined) {
		this.reflect('min', value);
	}

	get notched(): boolean {
		return this.hasAttribute('notched');
	}

	set notched(isNotched: boolean) {
		this.reflect('notched', isNotched);
	}

	get origin(): number | undefined {
		return this.optionalNumberAttribute('origin');
	}

	set origin(value: number | undefined) {
		this.reflect('origin', value);
	}

	get parseValue(): ((text: string) => number) | undefined {
		return this.#parseValue;
	}

	set parseValue(parse: ((text: string) => number) | undefined) {
		this.#parseValue = parse;
	}

	get positions(): Array<number> | undefined {
		return parseNumberList(this.getAttribute('positions'));
	}

	set positions(positions: Array<number> | undefined) {
		this.reflect('positions', positions?.join(' '));
	}

	get readout(): boolean {
		return this.hasAttribute('readout');
	}

	set readout(isShown: boolean) {
		this.reflect('readout', isShown);
	}

	get step(): number {
		return this.numberAttribute('step', 1);
	}

	set step(value: number | undefined) {
		this.reflect('step', value);
	}

	get taper(): 'linear' | 'log' {
		return this.getAttribute('taper') === 'log' ? 'log' : 'linear';
	}

	set taper(curve: 'linear' | 'log' | undefined) {
		this.reflect('taper', curve);
	}

	get value(): number {
		return this.#value;
	}

	set value(next: number) {
		if (this.#isHeld()) {
			this.heldWrite(next);
			return;
		}

		this.#write(next);
	}

	get valueText(): string {
		return this.#textFor(this.#value);
	}

	#buffered: Array<[number, number]> = [];

	readonly #claim = new ReadoutClaim(() => {
		this.#renderHold();
	});

	#entry: undefined | ValueEntry;

	#escapeWatch: AbortController | undefined;

	#formatSpokenValue: ((value: number) => string) | undefined;

	#formatValue: ((value: number) => string) | undefined;

	readonly #instance = String((instanceCount += 1));

	#isDirty = false;

	#isModulated = false;

	#keyScrub: KeyScrub | undefined;

	#land: undefined | ValueLanding;

	#limit: [number, number] | undefined;

	#modulationValue: number | undefined;

	#parseValue: ((text: string) => number) | undefined;

	#pointerDrag: PointerDrag<ValueDrag> | undefined;

	#positions: Array<number> | undefined;

	#readout: undefined | { anchor: HTMLElement; bubble: Readout };

	#scaleMarks: HTMLElement | undefined;

	#value = 0;

	readonly #watchers = new Set<() => void>();

	attributeChangedCallback(name: string): void {
		this.#positions = parseNumberList(this.getAttribute('positions'));
		if (name === 'value') {
			if (this.#isHeld()) {
				this.heldWrite(this.numberAttribute('value', this.min));
				return;
			}

			this.#isDirty = false;
		}
		if (name === 'disabled' && this.isDisabled()) this.#endHolds();

		this.#value = this.mapping().snap(
			this.#isDirty ? this.#value : this.numberAttribute('value', this.min),
		);
		if (proportionAttributes.has(name)) this.proportionsChanged();
		this.render();
	}

	override connectedCallback(): void {
		this.upgradeProperties(
			'buffered',
			'default',
			'dimmed',
			'doublePress',
			'max',
			'midpoint',
			'min',
			'notched',
			'origin',
			'readout',
			'step',
			'taper',
			'positions',
			'detent',
			'formatValue',
			'formatSpokenValue',
			'keyStep',
			'parseValue',
			'value',
		);
		super.connectedCallback();
	}

	protected bindGestures(
		control: HTMLElement,
		signal: AbortSignal,
		grab: (event: PointerEvent) => undefined | ValueAxis,
	): void {
		const entry = this.#bindEntry(control, signal);

		this.#pointerDrag = bindDrag<ValueDrag>(
			control,
			{
				cancel: (drag) => {
					if (drag.isKeptOnCancel !== true) this.input(drag.fromValue);
				},
				grab: (event) => {
					if (isMenuPress(event) || this.isDisabled() || entry.isOpen) return;

					this.toggleState('springing', false);
					// A click listener above makes WebKit send a tap's compatibility mousedown, which blurs the entry a double tap just opened
					if (event.pointerType === 'touch') event.preventDefault();
					focusByPointer(control);
					if (isResetPress(event)) {
						this.#reset();
						return;
					}

					const fromValue = this.#value;
					const axis = grab(event);
					if (!axis) return;

					const drag: ValueDrag = {
						...axis,
						fromValue,
						isOutside: false,
						isRevealed: false,
						revealTimer: undefined,
						state: this.#startDrag(control, axis, event),
					};

					drag.revealTimer = setTimeout(() => {
						this.#reveal(drag);
					}, revealMs);

					return drag;
				},
				lift: (drag, event) => {
					const tap = drag.state.isEngaged ? undefined : this.tapTarget();

					if (tap !== undefined) {
						entry.forgetPress();
						this.#commit(tap);
						return;
					}
					if (!entry.press(event) || this.springTarget() !== undefined) return;

					if (this.doublePress === 'reset') this.#reset();
					else entry.open();
				},
				move: (drag, event) => {
					this.#dragTo(drag, event);
				},
				release: (drag) => {
					this.#releaseDrag(drag);
				},
				toggle: (isDragging) => {
					this.toggleState('dragging', isDragging);
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
		this.#bindKeys(control, entry, signal);
		signal.addEventListener(
			'abort',
			() => {
				this.#endKeyScrub();
				this.#concealKeyReveal();
			},
			{ once: true },
		);
	}

	protected bindScale(control: HTMLElement, marks: HTMLElement, signal: AbortSignal): void {
		this.#scaleMarks = marks;
		this.mirrorChildren(
			{
				control,
				copy: scaleMark,
				isCopied: (child) => child instanceof Element && child.matches('[data-sonic-value]'),
				place: (copies) => {
					placeChildren(marks, copies);
					this.#renderScale();
				},
			},
			signal,
		);
	}

	protected controlOrientation(): 'horizontal' | 'vertical' | undefined {
		return undefined;
	}

	protected controlRole(): 'slider' | 'spinbutton' {
		return 'slider';
	}

	protected abstract draw(): void;

	protected abstract override focusTarget(): HTMLElement;

	protected heldFrom(): number | undefined {
		return this.#dragging()?.fromValue ?? this.#keyScrub?.fromValue;
	}

	protected heldWrite(_next: number): void {
		// Dropped unless a subclass draws where playback carries on
	}

	protected holdChanged(): void {
		// Only a subclass draws a hold
	}

	protected hoverReadout(value: number | undefined): void {
		this.#claim.hover(value);
		this.#renderReadout();
		this.#watchEscape(value !== undefined);
	}

	protected input(next: number): boolean {
		const previous = this.#value;

		this.#write(this.#limit ? clamp(next, ...this.#limit) : next);
		if (this.#value === previous) return false;

		this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

		return true;
	}

	protected isRevealed(): boolean {
		return this.#claim.isRevealed;
	}

	protected isWrapping(): boolean {
		return false;
	}

	protected mapping(): ValueMapping {
		const { detent, midpoint } = this;

		return valueMapping({
			...(detent === undefined ? {} : { detent }),
			...(this.#positions ? { positions: this.#positions } : {}),
			max: this.max,
			...(midpoint === undefined ? {} : { midpoint }),
			isNotched: this.notched,
			isWrapping: this.isWrapping(),
			min: this.min,
			step: this.step,
			taper: this.taper,
		});
	}

	protected originValue(): number {
		return this.origin ?? this.mapping().bounds[0];
	}

	protected proportionsChanged(): void {
		// Runs when every proportion moves, never per input
	}

	protected readModulationValue(): number | undefined {
		return this.#modulationValue;
	}

	protected readoutValue(): number {
		return this.#claim.shown(this.#value, this.readout).value ?? this.#value;
	}

	protected render(): void {
		this.draw();
		this.#renderScale();
		this.toggleState(
			'at-origin',
			!this.isWrapping() && this.#value === this.mapping().snap(this.originValue()),
		);
		this.#renderAria(this.focusTarget(), this.controlOrientation());
		for (const listener of this.#watchers) listener();
	}

	protected restoreState(state: string): void {
		this.value = Number(state);
	}

	protected scrubsKeyRepeat(): boolean {
		return false;
	}

	protected springTarget(): number | undefined {
		return undefined;
	}

	protected tapTarget(): number | undefined {
		return undefined;
	}

	protected travelPx(control: HTMLElement, property: `--_sonic-${string}`): number {
		return Math.max(1, readPxProperty(getComputedStyle(control), property, fallbackTravelPx));
	}

	protected writeModulationValue(
		control: HTMLElement,
		prefix: 'dial' | 'slider',
		next: number | undefined,
	): void {
		if (next !== undefined && !Number.isFinite(next)) return;

		this.#modulationValue = next;
		this.#writeModulationProportion(control, prefix);
	}

	protected writeProportions(
		control: HTMLElement,
		prefix: 'dial' | 'slider',
		modulation: number,
	): void {
		const { style } = control;
		const mapping = this.mapping();
		const value = mapping.proportionOf(this.#value);
		const reach = mapping.proportionOf(this.#value + modulation);
		const { positionCount } = mapping;

		style.setProperty(`--_sonic-${prefix}-value`, String(value));
		style.setProperty(
			`--_sonic-${prefix}-origin`,
			String(mapping.proportionOf(this.originValue())),
		);
		style.setProperty(`--_sonic-${prefix}-modulation-from`, String(Math.min(value, reach)));
		style.setProperty(`--_sonic-${prefix}-modulation-to`, String(Math.max(value, reach)));
		if (positionCount === undefined) style.removeProperty(`--_sonic-${prefix}-position-count`);
		else style.setProperty(`--_sonic-${prefix}-position-count`, String(positionCount));
		this.#writeModulationProportion(control, prefix);
	}

	#bindEntry(control: HTMLElement, signal: AbortSignal): ValueEntry {
		const input = requireChild(control, 'input', HTMLInputElement);
		const bubble = control.querySelector<HTMLElement>('[popover]');

		// Chrome's issues panel flags a form field with no id or name; a `name` would submit it
		input.id = `sonic-entry-${this.#instance}`;
		if (bubble) this.#readout = { anchor: control, bubble: new Readout(bubble) };

		const entry = new ValueEntry(input, {
			commit: (text) => {
				// eslint-disable-next-line unicorn/prefer-number-coercion -- `Number('')` is 0; an emptied field should leave the value alone
				this.#commit((this.#parseValue ?? Number.parseFloat)(text));
			},
			// `Number.parseFloat` reads "5 kHz" as 5
			text: () => (this.#parseValue ? this.valueText : String(this.#value)),
			toggle: (isOpen) => {
				this.#claim.edit(isOpen);
				if (isOpen) this.forwardNaming(input, true);
				this.toggleState('editing', isOpen);
				this.render();
			},
		});

		this.#entry = entry;
		entry.bind(control, signal);

		return entry;
	}

	#bindKeys(control: HTMLElement, entry: ValueEntry, signal: AbortSignal): void {
		control.addEventListener(
			'keydown',
			(event) => {
				if (this.isDisabled() || event.defaultPrevented || event.target !== control) return;

				this.toggleState('springing', false);
				if (event.key === 'Enter') {
					if (this.springTarget() !== undefined) return;

					event.preventDefault();
					entry.open();
					return;
				}

				const next = this.#keyTarget(event.key);
				if (next === undefined) return;

				event.preventDefault();
				this.#keyTo(event, next);
				this.#claim.reveal('keys');
				this.#renderHold();
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
				if (isMeta || this.mapping().keyTarget(event.key, this.#value) !== undefined) {
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
		const landed = Number.isFinite(next) ? (this.#land?.(next, direction) ?? next) : next;

		if (this.input(landed)) this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#concealKeyReveal(): void {
		if (this.#claim.conceal('keys')) this.#renderHold();
	}

	#dragging(): undefined | ValueDrag {
		return this.#pointerDrag?.current();
	}

	#dragTo(drag: ValueDrag, event: PointerEvent): void {
		const isOutside = drag.outside?.(event) === true;
		const wasEngaged = drag.state.isEngaged;
		const mapping = this.mapping();
		const { state, value } = stepDrag(mapping, drag.state, {
			isFine: event.shiftKey,
			isOutside,
			position: drag.position(event),
		});

		drag.state = this.#withinLimit(mapping, state);
		if (value === undefined) return;

		if (!wasEngaged) this.#reveal(drag);
		this.input(isOutside ? drag.fromValue : value);
		if (isOutside === drag.isOutside) return;

		drag.isOutside = isOutside;
		this.#renderDragReveal(drag);
	}

	#endHolds(): void {
		this.#entry?.close(false);
		this.#pointerDrag?.end();
		this.#endKeyScrub();
	}

	#endKeyScrub(): void {
		const scrub = this.#keyScrub;
		if (!scrub) return;

		this.#keyScrub = undefined;
		this.#renderHold();
		if (this.#value !== scrub.fromValue) this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#isHeld(): boolean {
		return this.#dragging() !== undefined || this.#keyScrub !== undefined;
	}

	#keyTarget(key: string): number | undefined {
		if (resetKeys.has(key)) return this.default;

		return this.mapping().keyTarget(key, this.#value, this.keyStep);
	}

	#keyTo(event: KeyboardEvent, next: number): void {
		if (event.repeat && this.scrubsKeyRepeat()) {
			this.#scrubKey(event.key, next);
			return;
		}

		this.#endKeyScrub();
		this.#commit(next, next > this.#value ? 1 : -1);
	}

	#releaseDrag(drag: ValueDrag): void {
		clearTimeout(drag.revealTimer);
		this.#claim.conceal('drag');
		this.#renderHold();
		if (this.#value !== drag.fromValue) this.dispatchEvent(new Event('change', { bubbles: true }));
		this.#springBack();
	}

	#renderAria(control: HTMLElement, orientation?: 'horizontal' | 'vertical'): void {
		this.writeFormValue(String(this.#value), String(this.#value));
		if (this.#entry?.isOpen) {
			for (const name of roleAttributes) control.removeAttribute(name);
			this.forwardNaming(control, false);
			this.#renderReadout();
			return;
		}

		const [low, high] = this.mapping().bounds;

		control.setAttribute('role', this.controlRole());
		control.setAttribute('aria-valuemin', String(low));
		control.setAttribute('aria-valuemax', String(high));
		control.setAttribute('aria-valuenow', String(this.#value));
		if (orientation) control.setAttribute('aria-orientation', orientation);
		writeAttribute(
			control,
			'aria-valuetext',
			(this.#formatSpokenValue ?? this.#formatValue)?.(this.#value),
		);
		this.forwardNaming(control, true);
		this.#renderDisabled(control);
		this.#renderReadout();
	}

	#renderDisabled(control: HTMLElement): void {
		if (this.isDisabled()) {
			control.setAttribute('aria-disabled', 'true');
			control.removeAttribute('tabindex');
			return;
		}

		control.removeAttribute('aria-disabled');
		control.setAttribute('tabindex', '0');
	}

	#renderDragReveal(drag: ValueDrag): void {
		if (drag.isRevealed && !drag.isOutside) this.#claim.reveal('drag');
		else this.#claim.conceal('drag');
		this.#renderHold();
	}

	#renderHold(): void {
		this.#renderReadout();
		this.holdChanged();
	}

	#renderReadout(): void {
		const readout = this.#readout;
		if (!readout) return;

		const { isOpen, value } = this.#claim.shown(this.#value, this.readout);

		readout.bubble.show({
			anchor: readout.anchor,
			isOpen,
			text: value === undefined ? undefined : this.#textFor(value),
		});
	}

	#renderScale(): void {
		const marks = this.#scaleMarks?.children ?? [];
		const mapping = this.mapping();

		for (const mark of marks) {
			if (!(mark instanceof HTMLElement || mark instanceof SVGElement)) continue;

			const at = String(mapping.proportionOf(scaleValue(mark)));

			if (mark.style.getPropertyValue('--_sonic-scale-at') !== at) {
				mark.style.setProperty('--_sonic-scale-at', at);
			}
		}
	}

	#reset(): void {
		this.#commit(this.default ?? NaN);
	}

	#reveal(drag: ValueDrag): void {
		if (drag.isRevealed || this.#dragging() !== drag) return;

		drag.isRevealed = true;
		this.#renderDragReveal(drag);
	}

	#scrubKey(key: string, next: number): void {
		if (this.#keyScrub?.key !== key) {
			this.#endKeyScrub();
			this.#keyScrub = { fromValue: this.#value, key };
		}
		this.input(next);
	}

	#springBack(): void {
		const target = this.springTarget();
		if (target === undefined) return;

		// Set before the commit so a `change` listener reading styles sees the glide
		if (this.mapping().snap(target) !== this.#value) this.toggleState('springing', true);
		this.#commit(target);
	}

	#startDrag(control: HTMLElement, axis: ValueAxis, event: PointerEvent): DragState {
		const mapping = this.mapping();
		const detent = this.detent;
		const start = {
			from: this.#value,
			position: axis.position(event),
			proportion: axis.fromProportion ?? mapping.proportionOf(this.#value),
			thresholdPx: dragThresholdPx(event.pointerType),
			travelPx: axis.travelPx,
		};
		if (detent === undefined) return startDrag(mapping, start);

		const zonePx = readPxProperty(getComputedStyle(control), '--_sonic-detent-zone', detentZonePx);

		return startDrag(mapping, {
			...start,
			detent: { value: detent, zone: zonePx / axis.travelPx },
		});
	}

	#textFor(value: number): string {
		return this.#formatValue?.(value) ?? String(value);
	}

	// A hover holds no focus, so the key is heard on the document (WCAG 1.4.13)
	#watchEscape(isHovered: boolean): void {
		if (!isHovered) {
			this.#escapeWatch?.abort();
			this.#escapeWatch = undefined;
			return;
		}
		if (this.#escapeWatch) return;

		const watch = new AbortController();

		this.#escapeWatch = watch;
		this.ownerDocument.addEventListener(
			'keydown',
			(event) => {
				if (event.key === 'Escape' && this.#claim.dismiss()) this.#renderHold();
			},
			{ signal: watch.signal },
		);
	}

	#withinLimit(mapping: ValueMapping, state: DragState): DragState {
		const limit = this.#limit;
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

	#write(next: number): void {
		if (!Number.isFinite(next)) return;

		this.#isDirty = true;

		const clamped = this.mapping().snap(next);
		if (clamped === this.#value) return;

		this.#value = clamped;
		this.render();
	}

	#writeModulationProportion(control: HTMLElement, prefix: 'dial' | 'slider'): void {
		const modulationValue = this.isWrapping() ? undefined : this.#modulationValue;
		const isModulated = modulationValue !== undefined;

		if (isModulated !== this.#isModulated) {
			this.#isModulated = isModulated;
			this.toggleState('modulated', isModulated);
		}
		if (modulationValue === undefined) {
			control.style.removeProperty(`--_sonic-${prefix}-modulation-value`);
			return;
		}

		control.style.setProperty(
			`--_sonic-${prefix}-modulation-value`,
			String(this.mapping().proportionOf(modulationValue)),
		);
	}
}
