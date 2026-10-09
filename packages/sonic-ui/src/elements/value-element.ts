import type { ValueAxis } from '#elements/value-gestures.ts';
import type { HoverPreview } from '#lib/hover-preview.ts';
import type { ScrubState } from '#lib/scrub.ts';
import type { ValueMapping, ValueSpec } from '#lib/value-mapping.ts';
import type { ValueModel } from '#lib/value-model.ts';

import { SonicFormElement } from '#elements/form-element.ts';
import { isUnanchored, Readout } from '#elements/readout.ts';
import { ValueGestures } from '#elements/value-gestures.ts';
import { bindHoverPreview } from '#lib/hover-preview.ts';
import { toNumber, trimFloat } from '#lib/math.ts';
import { parseNumberList } from '#lib/number-list.ts';
import { readPxProperty } from '#lib/read-px-property.ts';
import { createValueModel } from '#lib/value-model.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

declare const __DEV__: boolean;

declare global {
	interface HTMLElementEventMap {
		'sonic-hover': Event;
		'sonic-reveal': Event;
	}
}

interface HoverBinding {
	canShow?: () => boolean;
	changed?: () => void;
	place: () => void;
	valueAt: (event: PointerEvent) => number | undefined;
}

export interface ValueNotation {
	format: (value: number) => string;
	parse: (text: string) => number;
	speak?: (value: number) => string;
}

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

export interface ValueLink {
	change: () => void;
	input: (next: number, isMover?: boolean) => boolean;
	isDisabled: () => boolean;
	isHeld: () => boolean;
	model: ValueModel;
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
		'spoken-step',
		'step',
		'tabindex',
		'taper',
		'value',
		'positions',
	];

	static {
		link = (element) => ({
			change: () => {
				element.dispatchEvent(new Event('change', { bubbles: true }));
			},
			input: (next, isMover = false) => (isMover || !element.#isHeld()) && element.input(next),
			isDisabled: () => element.isDisabled(),
			isHeld: () => element.#isHeld(),
			model: element.#model,
		});
	}

	get cancelling(): boolean {
		return this.hasState('cancelling');
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

	get doublePress(): 'entry' | 'none' | 'reset' {
		const gesture = this.getAttribute('double-press');

		return gesture === 'none' || gesture === 'reset' ? gesture : 'entry';
	}

	set doublePress(gesture: 'entry' | 'none' | 'reset' | undefined) {
		this.reflect('double-press', gesture);
	}

	get dragging(): boolean {
		return this.hasState('dragging');
	}

	get entry(): 'none' | undefined {
		return this.getAttribute('entry') === 'none' ? 'none' : undefined;
	}

	set entry(gesture: 'none' | undefined) {
		this.reflect('entry', gesture);
	}

	get formatEntry(): ((value: number) => string) | undefined {
		return this.#formatEntry;
	}

	set formatEntry(format: ((value: number) => string) | undefined) {
		this.#formatEntry = format;
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

	get hoverValue(): number | undefined {
		return this.#hover?.value();
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

	get pointerType(): string | undefined {
		return this.#gestures?.pointerType();
	}

	/** The values a stepped control stops at, spaced evenly along the travel whatever their spacing */
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

	get revealed(): boolean {
		return this.hasState('revealed');
	}

	/** Rounds the value assistive technology hears, in value units; the value itself is untouched */
	get spokenStep(): number | undefined {
		return this.optionalNumberAttribute('spoken-step');
	}

	set spokenStep(value: number | undefined) {
		this.reflect('spoken-step', value);
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
		return this.#model.value;
	}

	set value(next: null | number | undefined) {
		// A framework removes a prop by setting the property to `undefined`
		if (next === undefined || next === null) {
			this.formResetCallback();
			return;
		}

		const value = toNumber(next);

		if (this.#isHeld()) {
			this.#writeHeld(value);
			return;
		}

		if (this.#model.write(value)) this.render();
	}

	get valueText(): string {
		return this.#textFor(this.#model.value);
	}

	// `Number.parseFloat`, as `Number('')` is 0; an emptied field should leave the value alone
	protected readonly notation: ValueNotation = { format: String, parse: Number.parseFloat };

	#formatEntry: ((value: number) => string) | undefined;

	#formatSpokenValue: ((value: number) => string) | undefined;

	#formatValue: ((value: number) => string) | undefined;

	#gestures: undefined | ValueGestures;

	#heldAt: number | undefined;

	#hover: HoverPreview | undefined;

	readonly #instance = String((instanceCount += 1));

	// A subclass adding an input to `isWrapping()` has to observe it
	readonly #model = createValueModel(() => this.#spec());

	#parseValue: ((text: string) => number) | undefined;

	#readout: undefined | { anchor: HTMLElement; bubble: Readout };

	#said:
		| undefined
		| { format: ((value: number) => string) | undefined; text: string | undefined; value: number };

	attributeChangedCallback(name: string): void {
		if (name === 'value' && this.#isHeld()) {
			this.#writeHeld(this.numberAttribute('value', this.min));
			return;
		}
		if (name === 'disabled' && this.isDisabled()) this.#gestures?.end();

		this.#model.respec(this.numberAttribute('value', this.min), { forgetAsk: name === 'value' });
		if (proportionAttributes.has(name) && this.isBound()) this.proportionsChanged();
		this.render();
	}

	override connectedCallback(): void {
		this.upgradeProperties(
			'default',
			'dimmed',
			'doublePress',
			'entry',
			'max',
			'midpoint',
			'min',
			'notched',
			'origin',
			'readout',
			'spokenStep',
			'step',
			'taper',
			'positions',
			'detent',
			'formatEntry',
			'formatValue',
			'formatSpokenValue',
			'keyStep',
			'parseValue',
			'value',
		);
		super.connectedCallback();
	}

	protected abandonHold(): void {
		this.#gestures?.abandon();
	}

	protected bindGestures(
		control: HTMLElement,
		signal: AbortSignal,
		grab: (event: PointerEvent) => undefined | ValueAxis,
	): void {
		const bubble = control.querySelector<HTMLElement>('[popover]');

		if (bubble) this.#readout = { anchor: control, bubble: new Readout(bubble) };
		this.#gestures = new ValueGestures(
			{
				default: () => this.default,
				detent: () => this.detent,
				dispatch: (type) => {
					this.dispatchEvent(new Event(type, { bubbles: true }));
				},
				doublePress: () => this.doublePress,
				entryId: `sonic-entry-${this.#instance}`,
				entryText: () => this.#entryText(),
				forwardNaming: (target, isNamed) => {
					this.forwardNaming(target, isNamed);
				},
				hasEntry: () => !isUnanchored && this.entry !== 'none',
				input: (next) => this.input(next),
				isDisabled: () => this.isDisabled(),
				keyStep: () => this.keyStep,
				model: this.#model,
				parse: (text) => (this.#parseValue ?? this.notation.parse)(text),
				render: () => {
					this.render();
				},
				scrubChanged: () => {
					this.#renderHold();
				},
				scrubsKeyRepeat: () => this.scrubsKeyRepeat(),
				springTarget: () => this.springTarget(),
				tapTarget: () => this.tapTarget(),
				toggleState: (state, isOn) => {
					this.toggleState(state, isOn);
				},
			},
			control,
			this.focusTarget(),
		);
		this.#gestures.bind(signal, grab);
		control.addEventListener(
			'pointerup',
			(event) => {
				this.#hover?.lift(event);
			},
			{ signal },
		);
	}

	protected bindHover(
		control: HTMLElement,
		signal: AbortSignal,
		{ canShow = () => true, changed, place, valueAt }: HoverBinding,
	): void {
		this.#hover = bindHoverPreview(
			control,
			{
				canShow,
				changed: () => {
					changed?.();
					this.dispatchEvent(new Event('sonic-hover', { bubbles: true }));
				},
				dismiss: () => {
					this.render();
				},
				isTaken: () => this.#isEditing() || this.#isRevealed(),
				show: () => {
					if (!this.readout) return;

					this.renderReadout();
					place();
				},
				valueAt,
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

	protected input(next: number): boolean {
		const previous = this.#model.value;

		if (this.#model.input(next)) this.render();
		if (this.#model.value === previous) return false;

		this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

		return true;
	}

	protected isWrapping(): boolean {
		return false;
	}

	protected mapping(): ValueMapping {
		return this.#model.mapping();
	}

	protected originValue(): number {
		return this.origin ?? this.mapping().bounds[0];
	}

	protected proportionsChanged(): void {
		// Runs when every proportion moves, never per input
	}

	protected readoutValue(): number {
		return this.#shown().value ?? this.#model.value;
	}

	protected render(): void {
		if (this.isBound()) this.#renderControl();
		this.#model.notify();
	}

	protected renderReadout(): void {
		const readout = this.#readout;
		if (!readout) return;

		const { isOpen, value } = this.#shown();
		const text = value === undefined ? undefined : this.#textFor(value);

		readout.bubble.show({ anchor: readout.anchor, isOpen: isOpen && text !== '', text });
	}

	protected restoreState(state: string): void {
		this.value = Number(state);
	}

	protected scrubChanged(): void {
		// Only a subclass draws a scrub
	}

	protected scrubsKeyRepeat(): boolean {
		return false;
	}

	protected scrubState(): ScrubState {
		const from = this.#gestures?.scrubFrom();

		return {
			from,
			isRevealed: this.#isRevealed(),
			played: from === undefined ? this.#model.value : (this.#heldAt ?? from),
		};
	}

	protected spokenText(value: number): string | undefined {
		return (this.#formatSpokenValue ?? this.#formatValue ?? this.notation.speak)?.(value);
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

	#entryText(): string {
		const value = this.#model.value;

		if (this.#formatEntry) return this.#formatEntry(value);

		// The notation's own parser may not read a consumer's `formatValue`
		if (!this.#parseValue) return this.notation.format(value);

		const text = this.valueText;

		if (__DEV__ && !Number.isFinite(this.#parseValue(text))) {
			console.warn(
				`<${this.localName}> opens its entry with "${text}", which parseValue cannot read; set formatEntry`,
			);
		}

		return text;
	}

	#isEditing(): boolean {
		return this.#gestures?.isEditing() === true;
	}

	#isHeld(): boolean {
		return this.#gestures?.isHeld() === true;
	}

	#isRevealed(): boolean {
		return this.#gestures?.isRevealed() === true;
	}

	#renderAria(control: HTMLElement, orientation?: 'horizontal' | 'vertical'): void {
		this.writeFormValue(String(this.#model.value), String(this.#model.value));
		if (this.#isEditing()) {
			for (const name of roleAttributes) control.removeAttribute(name);
			this.forwardNaming(control, false);
			this.renderReadout();
			return;
		}

		const [low, high] = this.mapping().bounds;

		writeAttribute(control, 'role', this.controlRole());
		writeAttribute(control, 'aria-valuemin', String(low));
		writeAttribute(control, 'aria-valuemax', String(high));
		writeAttribute(control, 'aria-valuenow', String(this.#spokenNow()));
		if (orientation) writeAttribute(control, 'aria-orientation', orientation);
		writeAttribute(control, 'aria-valuetext', this.#spokenValueText());
		this.forwardNaming(control, true);
		this.#renderDisabled(control);
		this.renderReadout();
	}

	#renderControl(): void {
		// A reveal or typed entry takes the readout from a hover
		if (this.#isEditing() || this.#isRevealed()) this.#hover?.clear();
		this.draw();
		this.toggleState(
			'at-origin',
			!this.isWrapping() && this.#model.value === this.mapping().snap(this.originValue()),
		);
		this.#renderAria(this.focusTarget(), this.controlOrientation());
	}

	#renderDisabled(control: HTMLElement): void {
		const isDisabled = this.isDisabled();

		writeAttribute(control, 'aria-disabled', isDisabled ? 'true' : undefined);
		// The host is `display: contents`, so its tab stop is the control's
		const stop = this.getAttribute('tabindex') === '-1' ? '-1' : '0';

		writeAttribute(control, 'tabindex', isDisabled ? undefined : stop);
	}

	#renderHold(): void {
		if (this.#gestures?.scrubFrom() === undefined) this.#heldAt = undefined;
		this.#hover?.restore();
		this.renderReadout();
		this.scrubChanged();
	}

	#shown(): { isOpen: boolean; value: number | undefined } {
		if (this.#isEditing()) return { isOpen: true, value: undefined };

		const isRevealed = this.#isRevealed();
		const preview = isRevealed ? undefined : this.#hover?.value();

		return {
			isOpen: (isRevealed || preview !== undefined) && this.readout,
			value: preview ?? this.#model.value,
		};
	}

	#spec(): ValueSpec {
		const { detent, midpoint, positions } = this;

		return {
			...(detent === undefined ? {} : { detent }),
			...(positions ? { positions } : {}),
			max: this.max,
			...(midpoint === undefined ? {} : { midpoint }),
			isNotched: this.notched,
			isWrapping: this.isWrapping(),
			min: this.min,
			step: this.step,
			taper: this.taper,
		};
	}

	#spokenNow(): number {
		const step = this.spokenStep;

		return step !== undefined && step > 0
			? trimFloat(Math.round(this.#model.value / step) * step)
			: this.#model.value;
	}

	#spokenValueText(): string | undefined {
		const format = this.#formatSpokenValue ?? this.#formatValue ?? this.notation.speak;
		const value = this.#spokenNow();
		const said = this.#said;
		if (said && said.format === format && said.value === value) return said.text;

		const text = format?.(value);

		this.#said = { format, text, value };

		return text;
	}

	#textFor(value: number): string {
		return (this.#formatValue ?? this.notation.format)(value);
	}

	#writeHeld(next: number): void {
		this.#heldAt = next;
		this.scrubChanged();
	}
}
