import type { DetentHold } from '#lib/detent.ts';
import type { Taper } from '#lib/taper.ts';

import { SonicFormElement } from '#elements/form-element.ts';
import { RangeEntry } from '#elements/range-entry.ts';
import { copyNode } from '#lib/copy-node.ts';
import { passDetent } from '#lib/detent.ts';
import { clamp, clampUnit, trimFloat, wrapUnit } from '#lib/math.ts';
import { nearestEntry, parseNumberList } from '#lib/number-list.ts';
import { readPxProperty } from '#lib/read-px-property.ts';
import { requireChild } from '#lib/render.ts';
import { linearTaper, listTaper, logTaper, skewTaper } from '#lib/taper.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

// `position` grows with the value
export interface RangeAxis {
	position: (event: PointerEvent) => number;
	travelPx: number;
}

interface RangeDrag extends RangeAxis {
	detent: DetentHold | undefined;
	fromValue: number;
	isRevealed: boolean;
	lastPosition: number;
	pointerId: number;
	// Unstepped, or a slow drag rounds back to where it started
	rawFraction: number;
	revealTimer: ReturnType<typeof setTimeout> | undefined;
	startPosition: number;
}

const detentZonePx = 8;
const fineScale = 0.1;
const keyRevealMs = 1000;
const pageSteps = 10;
const revealMs = 250;
const revealPx = 4;

// happy-dom has no popover API
const canPopover = 'togglePopover' in HTMLElement.prototype;

// A shared anchor name resolves to the last one on the page
let instanceCount = 0;

// A Mac keyboard's Delete sends Backspace
const resetKeys = new Set(['Backspace', 'Delete']);

const endKeys = new Set(['End', 'Home']);

const keySteps = new Map([
	['ArrowDown', -1],
	['ArrowLeft', -1],
	['ArrowRight', 1],
	['ArrowUp', 1],
	['PageDown', -pageSteps],
	['PageUp', pageSteps],
]);

// A slider's children are presentational, so these come off while the entry is open
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

// Blank is not zero, and a mark with no value has no place
function scaleValue(mark: ScaleMark): number {
	const text = mark.dataset.sonicValue?.trim();

	return text ? Number(text) : NaN;
}

function scaleMark(original: ChildNode): Array<ScaleMark> {
	const mark = copyNode(original);
	if (!(mark instanceof HTMLElement || mark instanceof SVGElement)) return [];
	if (!Number.isFinite(scaleValue(mark))) return [];

	const isTick = mark.childElementCount === 0 && mark.textContent.trim() === '';

	mark.classList.add(isTick ? 'sonic-scale-tick' : 'sonic-scale-label');

	return [mark];
}

// As on `<input type="range">`, the property never writes the `value` attribute back
export abstract class SonicRangeElement extends SonicFormElement {
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
		'values',
	];

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

	// Named for the absent attribute, as `input.type` reads `text`
	get doublePress(): 'reset' | 'type' {
		return this.getAttribute('double-press') === 'reset' ? 'reset' : 'type';
	}

	set doublePress(gesture: 'reset' | 'type' | undefined) {
		this.reflect('double-press', gesture);
	}

	get formatValue(): ((value: number) => string) | undefined {
		return this.#formatValue;
	}

	set formatValue(format: ((value: number) => string) | undefined) {
		this.#formatValue = format;
		this.render();
	}

	// Unclamped by `min`, so reading it back never pins the range
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

	// `undefined` while unset, so reading it back never pins it to `min`
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

	// A drag owns the value, so a timer's write can't pull the cap from under the pointer
	set value(next: number) {
		if (this.#drag) return;

		this.#write(next);
	}

	get values(): Array<number> | undefined {
		return parseNumberList(this.getAttribute('values'));
	}

	set values(entries: Array<number> | undefined) {
		this.reflect('values', entries?.join(' '));
	}

	#drag: RangeDrag | undefined;

	#entries: Array<number> | undefined;

	#entry: RangeEntry | undefined;

	#formatValue: ((value: number) => string) | undefined;

	readonly #instance = String((instanceCount += 1));

	// Re-read from the attribute until the property is set, since `max` may arrive after `value`
	#isDirty = false;

	#keyRevealTimer: ReturnType<typeof setTimeout> | undefined;

	#parseValue: ((text: string) => number) | undefined;

	#readout: undefined | { bubble: HTMLElement; text: HTMLElement };

	#scale: HTMLElement | undefined;

	#value = 0;

	attributeChangedCallback(name: string): void {
		this.#entries = parseNumberList(this.getAttribute('values'));
		if (name === 'value') {
			if (this.#drag) return;

			this.#isDirty = false;
		}
		if (name === 'disabled' && this.isDisabled()) {
			this.#entry?.close(false);
			this.#endDrag();
		}

		this.#value = this.#clamp(
			this.#isDirty ? this.#value : this.numberAttribute('value', this.min),
		);
		this.render();
	}

	// The range before `value`, or a value set with its `max` before upgrade clamps to the old one
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
			'step',
			'taper',
			'values',
			'detent',
			'formatValue',
			'parseValue',
			'value',
		);
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
				if (event.button !== 0 || this.isDisabled() || entry.isOpen) return;

				// A click listener above makes WebKit send a tap's compatibility mousedown, which blurs the entry a double tap just opened
				if (event.pointerType === 'touch') event.preventDefault();
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
					detent: this.#detentHold(control, axis.travelPx),
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
				const next = this.#move(drag, ((position - drag.lastPosition) / drag.travelPx) * scale);

				drag.lastPosition = position;
				if (Math.abs(position - drag.startPosition) >= revealPx) this.#reveal(drag);
				this.input(next);
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
				if (!entry.press(event) || this.springTarget() !== undefined) return;

				if (this.doublePress === 'reset') this.#reset();
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

	protected bindScale(control: HTMLElement, scale: HTMLElement, signal: AbortSignal): void {
		this.#scale = scale;
		this.mirrorChildren(
			{
				control,
				copy: (originals) => {
					scale.replaceChildren(...originals.flatMap((original) => scaleMark(original)));
					this.renderScale();
				},
				isCopied: (child) => child instanceof Element && child.matches('[data-sonic-value]'),
			},
			signal,
		);
	}

	protected clampRange(next: number): number {
		const min = this.min;
		if (!this.wraps()) return clamp(next, min, this.#max());

		const range = this.range();
		if (range <= 0) return min;

		const offset = trimFloat((((next - min) % range) + range) % range);

		return offset >= range ? min : trimFloat(min + offset);
	}

	protected controlRole(): 'slider' | 'spinbutton' {
		return 'slider';
	}

	protected fraction(value: number): number {
		return (this.#taper() ?? linearTaper(this.min, this.#max())).position(value);
	}

	protected input(next: number): boolean {
		const previous = this.#value;

		this.#write(next);
		if (this.#value === previous) return false;

		this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

		return true;
	}

	protected modulationFractions(amount: number): [number, number] {
		const value = this.fraction(this.#value);
		const modulated = this.fraction(this.#value + amount);

		return [Math.min(value, modulated), Math.max(value, modulated)];
	}

	protected originFraction(): number {
		return this.fraction(this.restValue());
	}

	protected positions(): number | undefined {
		const positions =
			this.#entries?.length ?? Math.round(this.range() / this.step) + (this.wraps() ? 0 : 1);

		if (!this.notched || !Number.isFinite(positions) || positions < 2) return;

		return positions;
	}

	protected range(): number {
		return this.#max() - this.min;
	}

	// Per render rather than per write, so a range with no `value` attribute submits its minimum too
	protected renderAria(control: HTMLElement, orientation?: 'horizontal' | 'vertical'): void {
		this.writeFormValue(String(this.#value), String(this.#value));
		if (this.#entry?.isOpen) {
			for (const name of roleAttributes) control.removeAttribute(name);
			this.forwardNaming(control, false);
			this.#renderReadout();
			return;
		}

		const [low, high] = this.#bounds();

		control.setAttribute('role', this.controlRole());
		control.setAttribute('aria-valuemin', String(low));
		control.setAttribute('aria-valuemax', String(high));
		control.setAttribute('aria-valuenow', String(this.#value));
		if (orientation) control.setAttribute('aria-orientation', orientation);
		writeAttribute(control, 'aria-valuetext', this.#formatValue?.(this.#value));
		this.forwardNaming(control, true);
		this.#renderDisabled(control);
		this.#renderReadout();
	}

	// Runs on every input, while the places move only with the range
	protected renderScale(): void {
		const marks = this.#scale?.children ?? [];

		for (const mark of marks) {
			if (!(mark instanceof HTMLElement || mark instanceof SVGElement)) continue;

			const at = String(this.fraction(this.clampRange(scaleValue(mark))));

			if (mark.style.getPropertyValue('--_sonic-scale-at') !== at) {
				mark.style.setProperty('--_sonic-scale-at', at);
			}
		}
	}

	protected restoreState(state: string): void {
		this.value = Number(state);
	}

	protected restValue(): number {
		return this.origin ?? this.#bounds()[0];
	}

	protected springTarget(): number | undefined {
		return undefined;
	}

	protected valueAt(fraction: number): number {
		return (this.#taper() ?? linearTaper(this.min, this.#max())).value(fraction);
	}

	protected valueText(): string {
		return this.#formatValue?.(this.#value) ?? String(this.#value);
	}

	protected wraps(): boolean {
		return false;
	}

	#bindEntry(control: HTMLElement, signal: AbortSignal): RangeEntry {
		const input = requireChild(control, 'input', HTMLInputElement);
		const bubble = control.querySelector<HTMLElement>('[popover]');

		// Chrome's issues panel flags a form field with no id or name; a `name` would submit it
		input.id = `sonic-entry-${this.#instance}`;
		if (bubble) {
			const anchor = `--sonic-readout-${this.#instance}`;

			this.#readout = { bubble, text: requireChild(bubble, 'span', HTMLElement) };
			control.style.setProperty('anchor-name', anchor);
			bubble.style.setProperty('position-anchor', anchor);
		}

		const entry = new RangeEntry(input, {
			commit: (text) => {
				// eslint-disable-next-line unicorn/prefer-number-coercion -- `Number('')` is 0; an emptied field should leave the value alone
				this.#commit((this.#parseValue ?? Number.parseFloat)(text));
			},
			// `Number.parseFloat` reads "5 kHz" as 5
			text: () => (this.#parseValue ? this.valueText() : String(this.#value)),
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
				if (this.isDisabled() || event.defaultPrevented || event.target !== control) return;

				if (event.key === 'Enter') {
					if (this.springTarget() !== undefined) return;

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
			'keyup',
			(event) => {
				if (keySteps.has(event.key) || endKeys.has(event.key)) this.#springBack();
			},
			{ signal },
		);
		control.addEventListener(
			'blur',
			() => {
				this.#hideForKeys();
				this.#springBack();
			},
			{ signal },
		);
	}

	#bounds(): [number, number] {
		const entries = this.#entries;

		return [entries?.[0] ?? this.min, entries?.at(-1) ?? this.#max()];
	}

	#clamp(next: number): number {
		const entries = this.#entries;
		if (entries) return nearestEntry(entries, next);

		const min = this.min;
		const step = this.step;
		const stepped = step > 0 ? min + Math.round((next - min) / step) * step : next;

		// A step like 0.01 leaves float residue
		return this.clampRange(trimFloat(stepped));
	}

	#commit(next: number): void {
		if (this.input(next)) this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#detentHold(control: HTMLElement, travelPx: number): DetentHold | undefined {
		const detent = this.detent;
		if (detent === undefined) return undefined;

		const value = this.#clamp(detent);
		const zonePx = readPxProperty(getComputedStyle(control), '--_sonic-detent-zone', detentZonePx);

		return {
			place: this.fraction(value),
			slack: value === this.#value ? 0 : undefined,
			value,
			zone: zonePx / travelPx,
		};
	}

	#end(step: number): number {
		if (!this.wraps()) return this.#bounds()[1];

		return this.min + (Math.ceil(this.range() / step) - 1) * step;
	}

	#endDrag(): void {
		const drag = this.#drag;
		if (!drag) return;

		clearTimeout(drag.revealTimer);
		this.#drag = undefined;
		this.toggleState('dragging', false);
		this.#renderReadout();
		if (this.#value !== drag.fromValue) this.dispatchEvent(new Event('change', { bubbles: true }));
		this.#springBack();
	}

	#hideForKeys(): void {
		clearTimeout(this.#keyRevealTimer);
		if (this.#keyRevealTimer === undefined) return;

		this.#keyRevealTimer = undefined;
		this.#renderReadout();
	}

	#isValueShown(): boolean {
		const isRevealed = this.#drag?.isRevealed === true || this.#keyRevealTimer !== undefined;

		return isRevealed && this.readout;
	}

	#keyTarget(key: string): number | undefined {
		if (key === 'Home') return this.#bounds()[0];
		const step = this.step > 0 ? this.step : this.range() / 100;

		if (key === 'End') return this.#end(step);
		if (resetKeys.has(key)) return this.default;

		const steps = keySteps.get(key);
		if (steps === undefined) return undefined;

		return this.#stopAtDetent(this.#stepBy(steps, step));
	}

	#max(): number {
		return Math.max(this.min, this.max);
	}

	#move(drag: RangeDrag, delta: number): number {
		const { detent } = drag;
		const to = drag.rawFraction + delta;
		const next = detent ? passDetent(detent, drag.rawFraction, to) : to;

		if (detent && next === undefined) {
			drag.rawFraction = detent.place;
			return detent.value;
		}

		const place = next ?? to;

		drag.rawFraction = this.wraps() ? wrapUnit(place) : clampUnit(place);

		return this.valueAt(drag.rawFraction);
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

	#renderReadout(): void {
		const readout = this.#readout;
		if (!readout || !canPopover || !this.isConnected) return;

		const isEditing = this.#entry?.isOpen === true;

		readout.text.hidden = isEditing;
		if (!isEditing) readout.text.textContent = this.valueText();
		readout.bubble.togglePopover(isEditing || this.#isValueShown());
	}

	#reset(): void {
		this.#commit(this.default ?? NaN);
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

	#springBack(): void {
		const target = this.springTarget();

		if (target !== undefined) this.#commit(target);
	}

	#stepBy(steps: number, step: number): number {
		const entries = this.#entries;
		if (entries) {
			const index = clamp(entries.indexOf(this.#value) + steps, 0, entries.length - 1);

			return entries[index] ?? this.#value;
		}

		const taper = this.#taper();
		if (!taper) return this.#value + steps * step;

		// By travel, since steps at the wide end would take forever; at least one step, or the snap holds it in place
		const next = this.#clamp(taper.value(taper.position(this.#value) + steps / 100));

		return next === this.#value ? this.#value + Math.sign(steps) * step : next;
	}

	#stopAtDetent(next: number): number {
		const detent = this.detent;
		if (detent === undefined) return next;

		const value = this.#clamp(detent);

		return (this.#value - value) * (next - value) < 0 ? value : next;
	}

	// Notches are evenly spaced, so a notched control stays linear
	#taper(): Taper | undefined {
		const entries = this.#entries;
		if (entries) return listTaper(entries);
		if (this.notched || this.wraps()) return undefined;

		const min = this.min;
		const max = this.#max();
		const log = this.taper === 'log' ? logTaper(min, max) : undefined;

		return log ?? skewTaper(min, max, this.midpoint ?? NaN);
	}

	#write(next: number): void {
		if (!Number.isFinite(next)) return;

		this.#isDirty = true;

		const clamped = this.#clamp(next);
		if (clamped === this.#value) return;

		this.#value = clamped;
		this.render();
	}
}
