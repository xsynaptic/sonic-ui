import type { Taper } from '#lib/taper.ts';

import { RangeEntry } from '#elements/range-entry.ts';
import { SonicElement } from '#elements/sonic-element.ts';
import { requireChild } from '#lib/render.ts';
import { clampUnit, linearTaper, logTaper, skewTaper } from '#lib/taper.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

// `position` grows with the value
export interface RangeAxis {
	position: (event: PointerEvent) => number;
	travelPx: number;
}

interface RangeDrag extends RangeAxis {
	fromValue: number;
	isRevealed: boolean;
	lastPosition: number;
	pointerId: number;
	// Unstepped, or a slow drag rounds back to where it started
	rawFraction: number;
	revealTimer: ReturnType<typeof setTimeout> | undefined;
	startPosition: number;
}

const fineScale = 0.1;
const keyRevealMs = 1000;
const pageSteps = 10;
const revealMs = 250;
const revealPx = 4;

// happy-dom has no popover API
const canPopover = 'togglePopover' in HTMLElement.prototype;

// A shared anchor name resolves to the last one on the page
let anchorCount = 0;

// A Mac keyboard's Delete sends Backspace
const resetKeys = new Set(['Backspace', 'Delete']);

const keySteps = new Map([
	['ArrowDown', -1],
	['ArrowLeft', -1],
	['ArrowRight', 1],
	['ArrowUp', 1],
	['PageDown', -pageSteps],
	['PageUp', pageSteps],
]);

// A slider's children are presentational, so these come off while the entry is open
const sliderAttributes = [
	'aria-disabled',
	'aria-orientation',
	'aria-valuemax',
	'aria-valuemin',
	'aria-valuenow',
	'aria-valuetext',
	'role',
	'tabindex',
];

// As on `<input type="range">`, the property never writes the `value` attribute back
export abstract class SonicRangeElement extends SonicElement {
	static override readonly observedAttributes = [
		...SonicElement.observedAttributes,
		'max',
		'midpoint',
		'min',
		'notched',
		'origin',
		'readout',
		'step',
		'taper',
		'value',
	];

	get formatValue(): ((value: number) => string) | undefined {
		return this.#formatValue;
	}

	set formatValue(format: ((value: number) => string) | undefined) {
		this.#formatValue = format;
		this.render();
	}

	get parseValue(): ((text: string) => number) | undefined {
		return this.#parseValue;
	}

	set parseValue(parse: ((text: string) => number) | undefined) {
		this.#parseValue = parse;
	}

	get value(): number {
		return this.#value;
	}

	// A drag owns the value, so a timer's write can't pull the cap from under the pointer
	set value(next: number) {
		if (this.#drag) return;

		this.#write(next);
	}

	readonly #anchor = `--sonic-readout-${String((anchorCount += 1))}`;

	#drag: RangeDrag | undefined;

	#entry: RangeEntry | undefined;

	#formatValue: ((value: number) => string) | undefined;

	// Re-read from the attribute until the property is set, since `max` may arrive after `value`
	#isDirty = false;

	#keyRevealTimer: ReturnType<typeof setTimeout> | undefined;

	#parseValue: ((text: string) => number) | undefined;

	#readout: undefined | { bubble: HTMLElement; text: HTMLElement };

	#value = 0;

	attributeChangedCallback(name: string): void {
		if (name === 'value') {
			if (this.#drag) return;

			this.#isDirty = false;
		}
		if (name === 'disabled' && this.disabled) {
			this.#entry?.close(false);
			this.#endDrag();
		}

		this.#value = this.#clamp(
			this.#isDirty ? this.#value : this.numberAttribute('value', this.min()),
		);
		this.render();
	}

	override connectedCallback(): void {
		this.upgradeProperty('formatValue');
		this.upgradeProperty('parseValue');
		this.upgradeProperty('value');
		super.connectedCallback();
	}

	protected bindGestures(
		control: HTMLElement,
		signal: AbortSignal,
		grab: (event: PointerEvent) => RangeAxis | undefined,
	): void {
		const entry = this.#bindEntry(control, signal);

		control.addEventListener(
			'pointerdown',
			(event) => {
				if (event.button !== 0 || this.disabled || entry.isOpen) return;

				control.focus();
				if (event.metaKey || event.ctrlKey) {
					this.#reset();
					return;
				}

				const fromValue = this.#value;
				const axis = grab(event);
				if (!axis) return;

				const startPosition = axis.position(event);
				const drag: RangeDrag = {
					fromValue,
					isRevealed: false,
					lastPosition: startPosition,
					pointerId: event.pointerId,
					position: axis.position,
					rawFraction: this.fraction(this.#value),
					revealTimer: undefined,
					startPosition,
					travelPx: axis.travelPx,
				};

				drag.revealTimer = setTimeout(() => {
					this.#reveal(drag);
				}, revealMs);
				this.#drag = drag;
				control.setPointerCapture(event.pointerId);
				this.toggleState('dragging', true);
			},
			{ signal },
		);
		control.addEventListener(
			'pointermove',
			(event) => {
				const drag = this.#drag;
				if (event.pointerId !== drag?.pointerId) return;

				const position = drag.position(event);
				const scale = event.shiftKey ? fineScale : 1;

				// Per move, so pressing Shift mid-drag changes pace without a jump
				drag.rawFraction = clampUnit(
					drag.rawFraction + ((position - drag.lastPosition) / drag.travelPx) * scale,
				);
				drag.lastPosition = position;
				if (Math.abs(position - drag.startPosition) >= revealPx) this.#reveal(drag);
				this.input(this.valueAt(drag.rawFraction));
			},
			{ signal },
		);

		const endDrag = (event: PointerEvent): void => {
			if (event.pointerId === this.#drag?.pointerId) this.#endDrag();
		};

		control.addEventListener(
			'pointercancel',
			(event) => {
				endDrag(event);
				entry.forgetPress();
			},
			{ signal },
		);
		// Other code can release capture without a `pointerup`
		control.addEventListener('lostpointercapture', endDrag, { signal });
		control.addEventListener(
			'pointerup',
			(event) => {
				if (event.pointerId !== this.#drag?.pointerId) return;

				this.#endDrag();
				if (!entry.press(event)) return;

				if (this.getAttribute('double-press') === 'reset') this.#reset();
				else entry.open();
			},
			{ signal },
		);
		this.#bindKeys(control, entry, signal);
		signal.addEventListener(
			'abort',
			() => {
				this.#endDrag();
				this.#hideForKeys();
			},
			{ once: true },
		);
	}

	protected clampRange(next: number): number {
		return Math.min(this.max(), Math.max(this.min(), next));
	}

	protected fraction(value: number): number {
		return (this.#taper() ?? linearTaper(this.min(), this.max())).position(value);
	}

	protected input(next: number): boolean {
		const previous = this.#value;

		this.#write(next);
		if (this.#value === previous) return false;

		this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

		return true;
	}

	protected max(): number {
		return Math.max(this.min(), this.numberAttribute('max', 100));
	}

	protected min(): number {
		return this.numberAttribute('min', 0);
	}

	protected originFraction(): number {
		return this.fraction(this.numberAttribute('origin', this.min()));
	}

	protected positions(): number | undefined {
		const positions = Math.round(this.range() / this.#step()) + 1;

		if (!this.hasAttribute('notched') || !Number.isFinite(positions) || positions < 2) return;

		return positions;
	}

	protected range(): number {
		return this.max() - this.min();
	}

	protected abstract render(): void;

	protected renderAria(control: HTMLElement, orientation?: 'horizontal' | 'vertical'): void {
		if (this.#entry?.isOpen) {
			for (const name of sliderAttributes) control.removeAttribute(name);
			this.forwardNaming(control, false);
			this.#renderReadout();
			return;
		}

		control.setAttribute('role', 'slider');
		control.setAttribute('aria-valuemin', String(this.min()));
		control.setAttribute('aria-valuemax', String(this.max()));
		control.setAttribute('aria-valuenow', String(this.#value));
		if (orientation) control.setAttribute('aria-orientation', orientation);
		writeAttribute(control, 'aria-valuetext', this.#formatValue?.(this.#value));
		this.forwardNaming(control, true);
		this.#renderDisabled(control);
		this.#renderReadout();
	}

	protected valueAt(fraction: number): number {
		return (this.#taper() ?? linearTaper(this.min(), this.max())).value(fraction);
	}

	#bindEntry(control: HTMLElement, signal: AbortSignal): RangeEntry {
		const input = requireChild(control, 'input', HTMLInputElement);
		const bubble = requireChild(control, '[popover]', HTMLElement);

		this.#readout = { bubble, text: requireChild(bubble, 'span', HTMLElement) };
		control.style.setProperty('anchor-name', this.#anchor);
		bubble.style.setProperty('position-anchor', this.#anchor);

		const entry = new RangeEntry(input, {
			commit: (text) => {
				// eslint-disable-next-line unicorn/prefer-number-coercion -- `Number('')` is 0; an emptied field should leave the value alone
				this.#commit((this.#parseValue ?? Number.parseFloat)(text));
			},
			// `Number.parseFloat` reads "5 kHz" as 5
			text: () => (this.#parseValue ? this.#valueText() : String(this.#value)),
			toggle: (isOpen) => {
				if (isOpen) this.forwardNaming(input, true);
				this.toggleState('editing', isOpen);
				this.render();
			},
		});

		this.#entry = entry;
		entry.bind(control, signal);

		return entry;
	}

	#bindKeys(control: HTMLElement, entry: RangeEntry, signal: AbortSignal): void {
		control.addEventListener(
			'keydown',
			(event) => {
				if (this.disabled || event.defaultPrevented || event.target !== control) return;

				if (event.key === 'Enter') {
					event.preventDefault();
					entry.open();
					return;
				}

				const next = this.#keyTarget(event.key);
				if (next === undefined) return;

				event.preventDefault();
				this.#commit(next);
				this.#revealForKeys();
			},
			{ signal },
		);
		control.addEventListener(
			'blur',
			() => {
				this.#hideForKeys();
			},
			{ signal },
		);
	}

	#clamp(next: number): number {
		const min = this.min();
		const step = this.#step();
		const stepped = step > 0 ? min + Math.round((next - min) / step) * step : next;

		// A step like 0.01 leaves float residue
		return this.clampRange(Number(stepped.toPrecision(12)));
	}

	#commit(next: number): void {
		if (this.input(next)) this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#endDrag(): void {
		const drag = this.#drag;
		if (!drag) return;

		clearTimeout(drag.revealTimer);
		this.#drag = undefined;
		this.toggleState('dragging', false);
		this.#renderReadout();
		if (this.#value !== drag.fromValue) this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#hideForKeys(): void {
		clearTimeout(this.#keyRevealTimer);
		if (this.#keyRevealTimer === undefined) return;

		this.#keyRevealTimer = undefined;
		this.#renderReadout();
	}

	#isValueShown(): boolean {
		const isRevealed = this.#drag?.isRevealed === true || this.#keyRevealTimer !== undefined;

		return isRevealed && this.hasAttribute('readout');
	}

	#keyTarget(key: string): number | undefined {
		if (key === 'Home') return this.min();
		if (key === 'End') return this.max();
		if (resetKeys.has(key)) return this.#resetValue();

		const steps = keySteps.get(key);
		if (steps === undefined) return undefined;

		const step = this.#step() > 0 ? this.#step() : this.range() / 100;
		const taper = this.#taper();
		if (!taper) return this.#value + steps * step;

		// By travel, since steps at the wide end would take forever; at least one step, or the snap holds it in place
		const next = this.#clamp(taper.value(taper.position(this.#value) + steps / 100));

		return next === this.#value ? this.#value + Math.sign(steps) * step : next;
	}

	#renderDisabled(control: HTMLElement): void {
		if (this.disabled) {
			control.setAttribute('aria-disabled', 'true');
			control.removeAttribute('tabindex');
			return;
		}

		control.removeAttribute('aria-disabled');
		control.setAttribute('tabindex', '0');
	}

	#renderReadout(): void {
		const readout = this.#readout;
		if (!readout || !canPopover || !this.isConnected) return;

		const isEditing = this.#entry?.isOpen === true;

		readout.text.hidden = isEditing;
		if (!isEditing) readout.text.textContent = this.#valueText();
		readout.bubble.togglePopover(isEditing || this.#isValueShown());
	}

	#reset(): void {
		this.#commit(this.numberAttribute('default', NaN));
	}

	#resetValue(): number | undefined {
		const value = this.numberAttribute('default', NaN);

		return Number.isFinite(value) ? value : undefined;
	}

	#reveal(drag: RangeDrag): void {
		if (drag.isRevealed || this.#drag !== drag) return;

		drag.isRevealed = true;
		this.#renderReadout();
	}

	#revealForKeys(): void {
		clearTimeout(this.#keyRevealTimer);
		this.#keyRevealTimer = setTimeout(() => {
			this.#hideForKeys();
		}, keyRevealMs);
		this.#renderReadout();
	}

	#step(): number {
		return this.numberAttribute('step', 1);
	}

	// Notches are evenly spaced, so a notched control stays linear
	#taper(): Taper | undefined {
		if (this.hasAttribute('notched')) return undefined;

		const min = this.min();
		const max = this.max();
		const log = this.getAttribute('taper') === 'log' ? logTaper(min, max) : undefined;

		return log ?? skewTaper(min, max, this.numberAttribute('midpoint', NaN));
	}

	#valueText(): string {
		return this.#formatValue?.(this.#value) ?? String(this.#value);
	}

	#write(next: number): void {
		if (!Number.isFinite(next)) return;

		this.#isDirty = true;
		this.#value = this.#clamp(next);
		this.render();
	}
}
