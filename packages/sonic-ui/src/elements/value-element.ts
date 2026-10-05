import type { ValueAxis } from '#elements/value-gestures.ts';
import type { AskedValue } from '#lib/asked-value.ts';
import type { HoverPreview } from '#lib/hover-preview.ts';
import type { ValueMapping } from '#lib/value-mapping.ts';

import { SonicFormElement } from '#elements/form-element.ts';
import { Readout } from '#elements/readout.ts';
import { ValueGestures } from '#elements/value-gestures.ts';
import { moveTo, resnap, setAsked } from '#lib/asked-value.ts';
import { bindHoverPreview } from '#lib/hover-preview.ts';
import { clamp, toNumber, trimFloat } from '#lib/math.ts';
import { parseNumberList } from '#lib/number-list.ts';
import { readPxProperty } from '#lib/read-px-property.ts';
import { valueMapping } from '#lib/value-mapping.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

// eslint-disable-next-line unicorn/consistent-boolean-name -- the name bundlers and other kits use
declare const __DEV__: boolean;

declare global {
	interface HTMLElementEventMap {
		'sonic-hover': Event;
		'sonic-reveal': Event;
	}
}

interface HoverBinding {
	canShow?: () => boolean;
	place: () => void;
	valueAt: (event: PointerEvent) => number | undefined;
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
		'spoken-step',
		'step',
		'tabindex',
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
			value: () => element.#cell.value,
			watch: (listener) => {
				element.#watchers.add(listener);

				return () => {
					element.#watchers.delete(listener);
				};
			},
		});
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
		return this.#cell.value;
	}

	set value(next: null | number | undefined) {
		// A framework removes a prop by setting the property to `undefined`
		if (next === undefined || next === null) {
			this.formResetCallback();
			return;
		}

		const value = toNumber(next);

		if (this.#isHeld()) {
			this.heldWrite(value);
			return;
		}

		if (setAsked(this.#cell, this.mapping(), value)) this.render();
	}

	get valueText(): string {
		return this.#textFor(this.#cell.value);
	}

	readonly #cell: AskedValue = { asked: undefined, value: 0 };

	#formatEntry: ((value: number) => string) | undefined;

	#formatSpokenValue: ((value: number) => string) | undefined;

	#formatValue: ((value: number) => string) | undefined;

	#gestures: undefined | ValueGestures;

	#heldAt: number | undefined;

	#hover: HoverPreview | undefined;

	readonly #instance = String((instanceCount += 1));

	#land: undefined | ValueLanding;

	#limit: [number, number] | undefined;

	// Every attribute it reads is observed; a subclass adding an input to `isWrapping()` has to observe it
	#mapping: undefined | ValueMapping;

	#parseValue: ((text: string) => number) | undefined;

	#positions: Array<number> | undefined;

	#readout: undefined | { anchor: HTMLElement; bubble: Readout };

	readonly #watchers = new Set<() => void>();

	attributeChangedCallback(name: string): void {
		this.#mapping = undefined;
		this.#positions = parseNumberList(this.getAttribute('positions'));
		if (name === 'value') {
			if (this.#isHeld()) {
				this.heldWrite(this.numberAttribute('value', this.min));
				return;
			}

			this.#cell.asked = undefined;
		}
		if (name === 'disabled' && this.isDisabled()) this.#gestures?.end();

		resnap(this.#cell, this.mapping(), this.numberAttribute('value', this.min));
		if (proportionAttributes.has(name) && this.isBound()) this.proportionsChanged();
		this.render();
	}

	override connectedCallback(): void {
		this.upgradeProperties(
			'default',
			'dimmed',
			'doublePress',
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
				holdChanged: () => {
					this.#renderHold();
				},
				input: (next) => this.input(next),
				isDisabled: () => this.isDisabled(),
				keyStep: () => this.keyStep,
				land: (target, direction) => this.#land?.(target, direction) ?? target,
				limit: () => this.#limit,
				mapping: () => this.mapping(),
				// eslint-disable-next-line unicorn/prefer-number-coercion -- `Number('')` is 0; an emptied field should leave the value alone
				parse: (text) => (this.#parseValue ?? Number.parseFloat)(text),
				render: () => {
					this.render();
				},
				scrubsKeyRepeat: () => this.scrubsKeyRepeat(),
				springTarget: () => this.springTarget(),
				tapTarget: () => this.tapTarget(),
				toggleState: (state, isOn) => {
					this.toggleState(state, isOn);
				},
				value: () => this.#cell.value,
			},
			control,
		);
		this.#gestures.bind(signal, grab);
		control.addEventListener(
			'pointerup',
			(event) => {
				this.#hover?.at(event);
			},
			{ signal },
		);
	}

	protected bindHover(
		control: HTMLElement,
		signal: AbortSignal,
		{ canShow = () => true, place, valueAt }: HoverBinding,
	): void {
		this.#hover = bindHoverPreview(
			control,
			{
				canShow,
				changed: () => {
					this.dispatchEvent(new Event('sonic-hover', { bubbles: true }));
				},
				dismiss: () => {
					this.render();
				},
				isTaken: () => this.#isEditing() || this.isRevealed(),
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

	protected heldFrom(): number | undefined {
		return this.#gestures?.heldFrom();
	}

	protected heldWrite(next: number): void {
		this.#heldAt = next;
	}

	protected holdChanged(): void {
		// Only a subclass draws a hold
	}

	protected input(next: number): boolean {
		const previous = this.#cell.value;

		const target = this.#limit ? clamp(next, ...this.#limit) : next;

		if (moveTo(this.#cell, this.mapping(), target)) this.render();
		if (this.#cell.value === previous) return false;

		this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

		return true;
	}

	protected isRevealed(): boolean {
		return this.#gestures?.isRevealed() === true;
	}

	protected isWrapping(): boolean {
		return false;
	}

	protected mapping(): ValueMapping {
		if (this.#mapping) return this.#mapping;

		const { detent, midpoint } = this;

		this.#mapping = valueMapping({
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

		return this.#mapping;
	}

	protected originValue(): number {
		return this.origin ?? this.mapping().bounds[0];
	}

	protected playback(): number {
		const from = this.heldFrom();

		return from === undefined ? this.#cell.value : (this.#heldAt ?? from);
	}

	protected proportionsChanged(): void {
		// Runs when every proportion moves, never per input
	}

	protected readoutValue(): number {
		return this.#shown().value ?? this.#cell.value;
	}

	protected render(): void {
		if (this.isBound()) this.#renderControl();
		for (const listener of this.#watchers) listener();
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

	#entryText(): string {
		const value = this.#cell.value;

		if (this.#formatEntry) return this.#formatEntry(value);

		// `Number.parseFloat` reads "5 kHz" as 5
		if (!this.#parseValue) return String(value);

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

	#renderAria(control: HTMLElement, orientation?: 'horizontal' | 'vertical'): void {
		this.writeFormValue(String(this.#cell.value), String(this.#cell.value));
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
		writeAttribute(
			control,
			'aria-valuetext',
			(this.#formatSpokenValue ?? this.#formatValue)?.(this.#cell.value),
		);
		this.forwardNaming(control, true);
		this.#renderDisabled(control);
		this.renderReadout();
	}

	#renderControl(): void {
		// A reveal or typed entry takes the readout from a hover
		if (this.#isEditing() || this.isRevealed()) this.#hover?.clear();
		this.draw();
		this.toggleState(
			'at-origin',
			!this.isWrapping() && this.#cell.value === this.mapping().snap(this.originValue()),
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
		if (this.heldFrom() === undefined) this.#heldAt = undefined;
		this.#hover?.restore();
		this.renderReadout();
		this.holdChanged();
	}

	#shown(): { isOpen: boolean; value: number | undefined } {
		if (this.#isEditing()) return { isOpen: true, value: undefined };

		const isRevealed = this.isRevealed();
		const preview = isRevealed ? undefined : this.#hover?.value();

		return {
			isOpen: (isRevealed || preview !== undefined) && this.readout,
			value: preview ?? this.#cell.value,
		};
	}

	#spokenNow(): number {
		const step = this.spokenStep;

		return step !== undefined && step > 0
			? trimFloat(Math.round(this.#cell.value / step) * step)
			: this.#cell.value;
	}

	#textFor(value: number): string {
		return this.#formatValue?.(value) ?? String(value);
	}
}
