import type { FieldGesture, FieldHold, FieldInput } from '#elements/field-gesture.ts';
import type { FieldAxis } from '#lib/field.ts';
import type { ValueSpec } from '#lib/value-mapping.ts';
import type { ValueModel } from '#lib/value-model.ts';

import { bindFieldGesture } from '#elements/field-gesture.ts';
import { SonicFormElement } from '#elements/form-element.ts';
import { ReadoutClaim } from '#elements/readout-claim.ts';
import { Readout } from '#elements/readout.ts';
import { pointerPosition } from '#lib/field.ts';
import { focusByPointer } from '#lib/focus-by-pointer.ts';
import { clampProportion, toNumber } from '#lib/math.ts';
import { isMenuPress, isResetPress } from '#lib/modifier-press.ts';
import { requireChild, template } from '#lib/render.ts';
import { resetKeys } from '#lib/value-mapping.ts';
import { createValueModel } from '#lib/value-model.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

declare const __DEV__: boolean;

declare global {
	interface HTMLElementTagNameMap {
		'sonic-xy': SonicXy;
	}
}

const axes = ['x', 'y'] as const;

const keyMoves = new Map<string, [FieldAxis, string]>([
	['ArrowDown', ['y', 'ArrowDown']],
	['ArrowLeft', ['x', 'ArrowLeft']],
	['ArrowRight', ['x', 'ArrowRight']],
	['ArrowUp', ['y', 'ArrowUp']],
	['End', ['x', 'PageUp']],
	['Home', ['x', 'PageDown']],
	['PageDown', ['y', 'PageDown']],
	['PageUp', ['y', 'PageUp']],
]);

const orientations = { x: 'horizontal', y: 'vertical' } as const;

const renderXy = template(
	/* HTML */ `
		<div class="sonic-xy">
			<div class="sonic-xy-bracket" aria-hidden="true"></div>
			<div class="sonic-xy-field" aria-hidden="true"></div>
			<div class="sonic-xy-puck">
				<div class="sonic-xy-axis" data-sonic-axis="x" role="slider" tabindex="0"></div>
				<div
					class="sonic-xy-axis"
					data-sonic-axis="y"
					role="slider"
					tabindex="-1"
					aria-hidden="true"
				></div>
			</div>
			<div class="sonic-xy-readout" aria-hidden="true" popover="manual"><span></span></div>
		</div>
	`,
	HTMLDivElement,
);

export class SonicXy extends SonicFormElement {
	static override readonly observedAttributes = [
		...SonicFormElement.observedAttributes,
		'name',
		'readout',
		'x',
		'x-label',
		'x-max',
		'x-midpoint',
		'x-min',
		'x-origin',
		'x-step',
		'x-taper',
		'y',
		'y-label',
		'y-max',
		'y-midpoint',
		'y-min',
		'y-origin',
		'y-step',
		'y-taper',
	];

	get formatValue(): ((value: number, axis: FieldAxis) => string) | undefined {
		return this.#formatValue;
	}

	set formatValue(format: ((value: number, axis: FieldAxis) => string) | undefined) {
		this.#formatValue = format;
		this.render();
	}

	// fallow-ignore-next-line code-duplication -- one accessor pair per property
	get pointerType(): string | undefined {
		return this.#gesture?.pointerType();
	}

	get readout(): boolean {
		return this.hasAttribute('readout');
	}

	set readout(isEnabled: boolean) {
		this.reflect('readout', isEnabled);
	}

	get x(): number {
		return this.#models.x.value;
	}

	set x(next: null | number | undefined) {
		this.#write('x', next);
	}

	get xDefault(): number | undefined {
		return this.optionalNumberAttribute('x-default');
	}

	set xDefault(value: number | undefined) {
		this.reflect('x-default', value);
	}

	get xLabel(): string | undefined {
		return this.getAttribute('x-label') ?? undefined;
	}

	set xLabel(label: string | undefined) {
		this.reflect('x-label', label);
	}

	get xMax(): number {
		return this.numberAttribute('x-max', 100);
	}

	set xMax(value: number | undefined) {
		this.reflect('x-max', value);
	}

	get xMidpoint(): number | undefined {
		return this.optionalNumberAttribute('x-midpoint');
	}

	set xMidpoint(value: number | undefined) {
		this.reflect('x-midpoint', value);
	}

	get xMin(): number {
		return this.numberAttribute('x-min', 0);
	}

	set xMin(value: number | undefined) {
		this.reflect('x-min', value);
	}

	get xOrigin(): number | undefined {
		return this.optionalNumberAttribute('x-origin');
	}

	set xOrigin(value: number | undefined) {
		this.reflect('x-origin', value);
	}

	get xStep(): number {
		return this.numberAttribute('x-step', 1);
	}

	set xStep(value: number | undefined) {
		this.reflect('x-step', value);
	}

	get xTaper(): ValueSpec['taper'] {
		return this.#taper('x');
	}

	set xTaper(curve: undefined | ValueSpec['taper']) {
		this.reflect('x-taper', curve);
	}

	get y(): number {
		return this.#models.y.value;
	}

	set y(next: null | number | undefined) {
		this.#write('y', next);
	}

	get yDefault(): number | undefined {
		return this.optionalNumberAttribute('y-default');
	}

	set yDefault(value: number | undefined) {
		this.reflect('y-default', value);
	}

	get yLabel(): string | undefined {
		return this.getAttribute('y-label') ?? undefined;
	}

	set yLabel(label: string | undefined) {
		this.reflect('y-label', label);
	}

	get yMax(): number {
		return this.numberAttribute('y-max', 100);
	}

	set yMax(value: number | undefined) {
		this.reflect('y-max', value);
	}

	get yMidpoint(): number | undefined {
		return this.optionalNumberAttribute('y-midpoint');
	}

	set yMidpoint(value: number | undefined) {
		this.reflect('y-midpoint', value);
	}

	get yMin(): number {
		return this.numberAttribute('y-min', 0);
	}

	set yMin(value: number | undefined) {
		this.reflect('y-min', value);
	}

	get yOrigin(): number | undefined {
		return this.optionalNumberAttribute('y-origin');
	}

	set yOrigin(value: number | undefined) {
		this.reflect('y-origin', value);
	}

	get yStep(): number {
		return this.numberAttribute('y-step', 1);
	}

	set yStep(value: number | undefined) {
		this.reflect('y-step', value);
	}

	get yTaper(): ValueSpec['taper'] {
		return this.#taper('y');
	}

	set yTaper(curve: undefined | ValueSpec['taper']) {
		this.reflect('y-taper', curve);
	}

	readonly #claim = new ReadoutClaim(() => {
		this.#renderReadout();
	});

	#currentAxis: FieldAxis = 'x';

	readonly #xy = renderXy();

	readonly #field = requireChild(this.#xy, '.sonic-xy-field', HTMLDivElement);

	#formatValue: ((value: number, axis: FieldAxis) => string) | undefined;

	#gesture: FieldGesture<FieldHold> | undefined;

	readonly #models: Record<FieldAxis, ValueModel> = {
		x: createValueModel(() => this.#spec('x')),
		y: createValueModel(() => this.#spec('y')),
	};

	readonly #parts: Record<FieldAxis, HTMLDivElement> = {
		x: requireChild(this.#xy, '[data-sonic-axis="x"]', HTMLDivElement),
		y: requireChild(this.#xy, '[data-sonic-axis="y"]', HTMLDivElement),
	};

	readonly #puck = requireChild(this.#xy, '.sonic-xy-puck', HTMLDivElement);

	readonly #readout = new Readout(requireChild(this.#xy, '.sonic-xy-readout', HTMLDivElement));

	attributeChangedCallback(name: string): void {
		if ((name === 'x' || name === 'y') && this.#gesture?.current()) return;
		if (name === 'disabled' && this.isDisabled()) this.#gesture?.end();

		this.#respec(name);
	}

	override connectedCallback(): void {
		this.upgradeProperties(
			'readout',
			'xDefault',
			'xLabel',
			'xMax',
			'xMidpoint',
			'xMin',
			'xOrigin',
			'xStep',
			'xTaper',
			'yDefault',
			'yLabel',
			'yMax',
			'yMidpoint',
			'yMin',
			'yOrigin',
			'yStep',
			'yTaper',
			'formatValue',
			'x',
			'y',
		);
		super.connectedCallback();
	}

	override formResetCallback(): void {
		this.#respec(...axes);
	}

	protected connect(signal: AbortSignal): void {
		const xy = this.#xy;

		this.keepControl(xy, signal);
		this.render();
		if (__DEV__)
			this.checkStyles(xy, 'xy.css', {
				box: { property: 'margin-bottom', selector: '[popover]' },
				material: ['cap', ['glass', '[popover]'], 'readout', ['bracket', '.sonic-xy-bracket']],
			});
		this.#bindPointer(xy, signal);
		this.#bindKeys(xy, signal);
	}

	protected override focusTarget(): HTMLElement {
		return this.#parts[this.#currentAxis];
	}

	protected render(): void {
		if (!this.isBound()) return;

		const { style } = this.#xy;

		for (const axis of axes) {
			const model = this.#models[axis];
			const mapping = model.mapping();
			const origin = this.optionalNumberAttribute(`${axis}-origin`) ?? mapping.bounds[0];

			style.setProperty(`--_sonic-xy-${axis}`, String(mapping.proportionOf(model.value)));
			style.setProperty(`--_sonic-xy-${axis}-origin`, String(mapping.proportionOf(origin)));
		}
		this.#renderAria();
		this.#renderForm();
		this.#renderReadout();
	}

	protected restoreState(state: string): void {
		const [x = NaN, y = NaN] = state.split(',').map(Number);

		this.x = x;
		this.y = y;
	}

	#axisText(axis: FieldAxis): string {
		const { value } = this.#models[axis];
		const label = this.getAttribute(`${axis}-label`) ?? axis.toUpperCase();

		return `${label} ${this.#formatValue?.(value, axis) ?? String(value)}`;
	}

	#bindKeys(xy: HTMLElement, signal: AbortSignal): void {
		xy.addEventListener(
			'keydown',
			(event) => {
				if (this.isDisabled() || event.defaultPrevented) return;

				const move = keyMoves.get(event.key);
				if (!move && !(resetKeys.has(event.key) && this.#hasDefault())) return;

				event.preventDefault();
				if (move) this.#keyTo(...move);
				else this.#reset();
				this.#claim.reveal('keys');
				this.#renderReadout();
			},
			{ signal },
		);
		xy.addEventListener(
			'focusout',
			(event) => {
				// A key on the other axis moves focus between the two parts
				if (event.relatedTarget instanceof Node && xy.contains(event.relatedTarget)) return;
				if (this.#claim.conceal('keys')) this.#renderReadout();
			},
			{ signal },
		);
		signal.addEventListener(
			'abort',
			() => {
				this.#claim.conceal('keys');
			},
			{ once: true },
		);
	}

	#bindPointer(xy: HTMLElement, signal: AbortSignal): void {
		// A press on the field would take focus off the axis part and select the page's text
		xy.addEventListener(
			'mousedown',
			(event) => {
				event.preventDefault();
			},
			{ signal },
		);
		this.#gesture = bindFieldGesture(
			xy,
			{
				claim: this.#claim,
				grab: (event) => {
					if (this.isDisabled() || isMenuPress(event)) return;

					focusByPointer(this.focusTarget());
					if (!isResetPress(event)) {
						this.toggleState('dragging', true);

						return this.#grab(event);
					}

					this.#reset();

					return;
				},
				input: (_hold, next) => {
					if (!this.#input(next)) this.#renderReadout();
				},
				release: (_hold, moved) => {
					if (moved.length > 0) this.dispatchEvent(new Event('change', { bubbles: true }));
				},
				toggle: (isDragging) => {
					this.toggleState('dragging', isDragging);
				},
			},
			signal,
		);
	}

	#commit(next: FieldInput): void {
		if (this.#input(next)) this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#grab(event: PointerEvent): FieldHold {
		const field = this.#field.getBoundingClientRect();
		const puck = this.#puck.getBoundingClientRect();
		const { x, y } = this.#models;
		const from = { x: x.value, y: y.value };
		const travel = {
			x: Math.max(1, field.width - puck.width),
			y: Math.max(1, field.height - puck.height),
		};
		const position = pointerPosition(event);
		const pressed = {
			x: (position.x - field.left - puck.width / 2) / travel.x,
			y: (position.y + field.bottom - puck.height / 2) / travel.y,
		};
		const isOnPuck = event.target instanceof Node && this.#puck.contains(event.target);

		if (!isOnPuck) {
			this.#input({ x: x.mapping().valueAt(pressed.x), y: y.mapping().valueAt(pressed.y) });
		}

		const hold = (axis: FieldAxis) => ({
			from: from[axis],
			model: this.#models[axis],
			...(isOnPuck ? {} : { proportion: clampProportion(pressed[axis]) }),
			travelPx: travel[axis],
		});

		return { axes: { x: hold('x'), y: hold('y') } };
	}

	#hasDefault(): boolean {
		return this.xDefault !== undefined || this.yDefault !== undefined;
	}

	#input(next: FieldInput): boolean {
		let hasMoved = false;

		for (const axis of axes) {
			if (this.#models[axis].input(next[axis] ?? NaN)) hasMoved = true;
		}
		if (!hasMoved) return false;

		this.render();
		this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

		return true;
	}

	#keyTo(axis: FieldAxis, key: string): void {
		const model = this.#models[axis];
		const hasMoved = model.input(model.mapping().keyTarget(key, model.value) ?? NaN);

		this.#currentAxis = axis;
		this.render();
		this.#parts[axis].focus();
		if (!hasMoved) return;

		this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#renderAria(): void {
		const isDisabled = this.isDisabled();

		for (const axis of axes) {
			const part = this.#parts[axis];
			const model = this.#models[axis];
			const [low, high] = model.mapping().bounds;
			const isCurrent = axis === this.#currentAxis;
			const stop = isCurrent ? '0' : '-1';

			writeAttribute(part, 'aria-orientation', orientations[axis]);
			writeAttribute(part, 'aria-valuemin', String(low));
			writeAttribute(part, 'aria-valuemax', String(high));
			writeAttribute(part, 'aria-valuenow', String(model.value));
			writeAttribute(part, 'aria-valuetext', this.#valueText(axis));
			this.forwardNaming(part, true);
			writeAttribute(part, 'aria-hidden', isCurrent ? undefined : 'true');
			writeAttribute(part, 'aria-disabled', isDisabled ? 'true' : undefined);
			writeAttribute(part, 'tabindex', isDisabled ? undefined : stop);
		}
	}

	#renderForm(): void {
		const { name, x, y } = this;
		const state = `${String(x)},${String(y)}`;

		if (name === '') {
			// eslint-disable-next-line unicorn/no-null -- `null` submits nothing
			this.writeFormValue(null, state);
			return;
		}

		const fields = new FormData();

		fields.set(`${name}.x`, String(x));
		fields.set(`${name}.y`, String(y));
		this.writeFormValue(fields, state);
	}

	#renderReadout(): void {
		this.#readout.show({
			anchor: this.#puck,
			isOpen: this.#claim.isRevealed && this.readout,
			text: this.#valueText('x'),
		});
	}

	#reset(): void {
		this.#commit({ x: this.xDefault, y: this.yDefault });
	}

	#respec(...forgotten: Array<string>): void {
		for (const axis of axes) {
			this.#models[axis].respec(
				this.numberAttribute(axis, this.numberAttribute(`${axis}-min`, 0)),
				{ forgetAsk: forgotten.includes(axis) },
			);
		}
		this.render();
	}

	#spec(axis: FieldAxis): ValueSpec {
		const midpoint = this.optionalNumberAttribute(`${axis}-midpoint`);

		return {
			max: this.numberAttribute(`${axis}-max`, 100),
			...(midpoint === undefined ? {} : { midpoint }),
			isNotched: false,
			isWrapping: false,
			min: this.numberAttribute(`${axis}-min`, 0),
			step: this.numberAttribute(`${axis}-step`, 1),
			taper: this.#taper(axis),
		};
	}

	#taper(axis: FieldAxis): ValueSpec['taper'] {
		return this.getAttribute(`${axis}-taper`) === 'log' ? 'log' : 'linear';
	}

	#valueText(axis: FieldAxis): string {
		return `${this.#axisText(axis)}, ${this.#axisText(axis === 'x' ? 'y' : 'x')}`;
	}

	#write(axis: FieldAxis, next: null | number | undefined): void {
		if (this.#gesture?.current()) return;

		// A framework removes a prop by setting the property to `undefined`
		if (next === undefined || next === null) {
			this.#respec(axis);
			return;
		}

		if (this.#models[axis].write(toNumber(next))) this.render();
	}
}
