import type { PlaneAxis, PlaneDragState, PlanePoint } from '#lib/plane.ts';
import type { PointerDrag } from '#lib/pointer-drag.ts';
import type { RangeScale, RangeSpec } from '#lib/range-scale.ts';

import { SonicFormElement } from '#elements/form-element.ts';
import { dragThresholdPx } from '#lib/drag-step.ts';
import { focusByPointer } from '#lib/focus-by-pointer.ts';
import { clampUnit } from '#lib/math.ts';
import { pointerMove, pointerPosition, startPlaneDrag, stepPlaneDrag } from '#lib/plane.ts';
import { bindDrag } from '#lib/pointer-drag.ts';
import { rangeScale, resetKeys } from '#lib/range-scale.ts';
import { requireChild, template } from '#lib/render.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-xy': SonicXy;
	}
}

interface AxisValue {
	isDirty: boolean;
	value: number;
}

interface XyDrag {
	from: PlanePoint;
	state: PlaneDragState;
}

interface XyInput {
	x: number | undefined;
	y: number | undefined;
}

const axes = ['x', 'y'] as const;

const keyMoves = new Map<string, [PlaneAxis, string]>([
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
		</div>
	`,
	HTMLDivElement,
);

export class SonicXy extends SonicFormElement {
	static override readonly observedAttributes = [
		...SonicFormElement.observedAttributes,
		'name',
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

	get formatValue(): ((value: number, axis: PlaneAxis) => string) | undefined {
		return this.#formatValue;
	}

	set formatValue(format: ((value: number, axis: PlaneAxis) => string) | undefined) {
		this.#formatValue = format;
		this.render();
	}

	get x(): number {
		return this.#values.x.value;
	}

	set x(next: number) {
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

	get xTaper(): RangeSpec['taper'] {
		return this.#taper('x');
	}

	set xTaper(curve: RangeSpec['taper'] | undefined) {
		this.reflect('x-taper', curve);
	}

	get y(): number {
		return this.#values.y.value;
	}

	set y(next: number) {
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

	get yTaper(): RangeSpec['taper'] {
		return this.#taper('y');
	}

	set yTaper(curve: RangeSpec['taper'] | undefined) {
		this.reflect('y-taper', curve);
	}

	#currentAxis: PlaneAxis = 'x';

	readonly #xy = renderXy();

	readonly #field = requireChild(this.#xy, '.sonic-xy-field', HTMLDivElement);

	#formatValue: ((value: number, axis: PlaneAxis) => string) | undefined;

	readonly #parts: Record<PlaneAxis, HTMLDivElement> = {
		x: requireChild(this.#xy, '[data-sonic-axis="x"]', HTMLDivElement),
		y: requireChild(this.#xy, '[data-sonic-axis="y"]', HTMLDivElement),
	};

	#pointerDrag: PointerDrag<XyDrag> | undefined;

	readonly #puck = requireChild(this.#xy, '.sonic-xy-puck', HTMLDivElement);

	readonly #values: Record<PlaneAxis, AxisValue> = {
		x: { isDirty: false, value: 0 },
		y: { isDirty: false, value: 0 },
	};

	attributeChangedCallback(name: string): void {
		if (name === 'x' || name === 'y') {
			if (this.#pointerDrag?.current()) return;

			this.#values[name].isDirty = false;
		}
		if (name === 'disabled' && this.isDisabled()) this.#pointerDrag?.end();

		this.#refresh();
	}

	override connectedCallback(): void {
		this.upgradeProperties(
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
		for (const axis of axes) this.#values[axis].isDirty = false;

		this.#refresh();
	}

	protected connect(signal: AbortSignal): void {
		const xy = this.#xy;

		this.appendOnce(xy);
		this.render();
		this.checkStyles(xy, 'xy.css');
		this.#bindPointer(xy, signal);
		this.#bindKeys(xy, signal);
	}

	protected override focusTarget(): HTMLElement {
		return this.#parts[this.#currentAxis];
	}

	protected render(): void {
		const { style } = this.#xy;
		const scales = this.#scales();

		for (const axis of axes) {
			const scale = scales[axis];
			const origin = this.optionalNumberAttribute(`${axis}-origin`) ?? scale.bounds[0];

			style.setProperty(`--_sonic-xy-${axis}`, String(scale.place(this.#values[axis].value)));
			style.setProperty(`--_sonic-xy-${axis}-origin`, String(scale.place(origin)));
		}
		this.#renderAria();
		this.#renderForm();
	}

	protected restoreState(state: string): void {
		const [x = NaN, y = NaN] = state.split(',').map(Number);

		this.x = x;
		this.y = y;
	}

	#axisText(axis: PlaneAxis): string {
		const { value } = this.#values[axis];
		const label = this.getAttribute(`${axis}-label`) ?? axis.toUpperCase();

		return `${label} ${this.#formatValue?.(value, axis) ?? String(value)}`;
	}

	#bindKeys(xy: HTMLElement, signal: AbortSignal): void {
		xy.addEventListener(
			'keydown',
			(event) => {
				if (this.isDisabled() || event.defaultPrevented) return;

				const move = keyMoves.get(event.key);

				if (move) {
					event.preventDefault();
					this.#keyTo(...move);
					return;
				}
				if (!resetKeys.has(event.key) || !this.#hasDefault()) return;

				event.preventDefault();
				this.#reset();
			},
			{ signal },
		);
	}

	#bindPointer(xy: HTMLElement, signal: AbortSignal): void {
		// A press on the glass would take focus off the axis part and select the page's text
		xy.addEventListener(
			'mousedown',
			(event) => {
				event.preventDefault();
			},
			{ signal },
		);
		this.#pointerDrag = bindDrag(
			xy,
			{
				cancel: (drag) => {
					this.#input(drag.from);
				},
				grab: (event) => {
					if (this.isDisabled()) return;

					focusByPointer(this.focusTarget());
					if (!event.metaKey && !event.ctrlKey) return this.#grab(event);

					this.#reset();

					return;
				},
				move: (drag, event) => {
					const step = stepPlaneDrag(this.#scales(), drag.state, pointerMove(event));

					drag.state = step.state;
					this.#input(step);
				},
				release: (drag) => {
					if (this.x === drag.from.x && this.y === drag.from.y) return;

					this.dispatchEvent(new Event('change', { bubbles: true }));
				},
				toggle: (isDragging) => {
					this.toggleState('dragging', isDragging);
				},
			},
			signal,
		);
	}

	#commit(next: XyInput): void {
		if (this.#input(next)) this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#grab(event: PointerEvent): XyDrag {
		const from = { x: this.x, y: this.y };
		const field = this.#field.getBoundingClientRect();
		const puck = this.#puck.getBoundingClientRect();
		const scales = this.#scales();
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

		if (!isOnPuck) this.#input({ x: scales.x.valueAt(pressed.x), y: scales.y.valueAt(pressed.y) });

		const start = (axis: PlaneAxis) => ({
			from: this.#values[axis].value,
			place: isOnPuck ? scales[axis].place(this.#values[axis].value) : clampUnit(pressed[axis]),
			scale: scales[axis],
			travelPx: travel[axis],
		});

		return {
			from,
			state: startPlaneDrag({
				position,
				thresholdPx: dragThresholdPx(event.pointerType),
				x: start('x'),
				y: start('y'),
			}),
		};
	}

	#hasDefault(): boolean {
		return this.xDefault !== undefined || this.yDefault !== undefined;
	}

	#input(next: XyInput): boolean {
		let hasMoved = false;

		for (const axis of axes) {
			if (this.#set(axis, next[axis] ?? NaN)) hasMoved = true;
		}
		if (!hasMoved) return false;

		this.render();
		this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

		return true;
	}

	#keyTo(axis: PlaneAxis, key: string): void {
		const next = this.#scale(axis).keyTarget(key, this.#values[axis].value);
		const hasMoved = this.#set(axis, next ?? NaN);

		this.#currentAxis = axis;
		this.render();
		this.#parts[axis].focus();
		if (!hasMoved) return;

		this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#refresh(): void {
		const scales = this.#scales();

		for (const axis of axes) {
			const axisValue = this.#values[axis];
			const scale = scales[axis];

			axisValue.value = scale.snap(
				axisValue.isDirty ? axisValue.value : this.numberAttribute(axis, scale.bounds[0]),
			);
		}
		this.render();
	}

	// Provisional until heard in a screen reader
	#renderAria(): void {
		const scales = this.#scales();
		const isDisabled = this.isDisabled();

		for (const axis of axes) {
			const part = this.#parts[axis];
			const [low, high] = scales[axis].bounds;
			const isCurrent = axis === this.#currentAxis;
			const stop = isCurrent ? '0' : '-1';

			part.setAttribute('aria-orientation', orientations[axis]);
			part.setAttribute('aria-valuemin', String(low));
			part.setAttribute('aria-valuemax', String(high));
			part.setAttribute('aria-valuenow', String(this.#values[axis].value));
			part.setAttribute('aria-valuetext', this.#valueText(axis));
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

		const entries = new FormData();

		entries.set(`${name}.x`, String(x));
		entries.set(`${name}.y`, String(y));
		this.writeFormValue(entries, state);
	}

	#reset(): void {
		this.#commit({ x: this.xDefault, y: this.yDefault });
	}

	#scale(axis: PlaneAxis): RangeScale {
		const midpoint = this.optionalNumberAttribute(`${axis}-midpoint`);

		return rangeScale({
			max: this.numberAttribute(`${axis}-max`, 100),
			...(midpoint === undefined ? {} : { midpoint }),
			isNotched: false,
			isWrapping: false,
			min: this.numberAttribute(`${axis}-min`, 0),
			step: this.numberAttribute(`${axis}-step`, 1),
			taper: this.#taper(axis),
		});
	}

	#scales(): Record<PlaneAxis, RangeScale> {
		return { x: this.#scale('x'), y: this.#scale('y') };
	}

	#set(axis: PlaneAxis, next: number): boolean {
		if (!Number.isFinite(next)) return false;

		const axisValue = this.#values[axis];
		const snapped = this.#scale(axis).snap(next);

		axisValue.isDirty = true;
		if (snapped === axisValue.value) return false;

		axisValue.value = snapped;

		return true;
	}

	#taper(axis: PlaneAxis): RangeSpec['taper'] {
		return this.getAttribute(`${axis}-taper`) === 'log' ? 'log' : 'linear';
	}

	#valueText(axis: PlaneAxis): string {
		return `${this.#axisText(axis)}, ${this.#axisText(axis === 'x' ? 'y' : 'x')}`;
	}

	#write(axis: PlaneAxis, next: number): void {
		if (this.#pointerDrag?.current()) return;
		if (this.#set(axis, next)) this.render();
	}
}
