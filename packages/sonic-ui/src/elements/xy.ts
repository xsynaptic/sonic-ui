import type { FieldAxis, FieldDragState, FieldPoint } from '#lib/field.ts';
import type { PointerDrag } from '#lib/pointer-drag.ts';
import type { ValueMapping, ValueSpec } from '#lib/value-mapping.ts';

import { SonicFormElement } from '#elements/form-element.ts';
import { ReadoutClaim } from '#elements/readout-claim.ts';
import { Readout } from '#elements/readout.ts';
import { dragThresholdPx } from '#lib/drag-step.ts';
import { pointerMove, pointerPosition, startFieldDrag, stepFieldDrag } from '#lib/field.ts';
import { focusByPointer } from '#lib/focus-by-pointer.ts';
import { clampProportion, toNumber } from '#lib/math.ts';
import { isMenuPress, isResetPress } from '#lib/modifier-press.ts';
import { bindDrag } from '#lib/pointer-drag.ts';
import { requireChild, template } from '#lib/render.ts';
import { resetKeys, valueMapping } from '#lib/value-mapping.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-xy': SonicXy;
	}
}

interface AxisValue {
	asked: number | undefined;
	value: number;
}

interface XyDrag {
	from: FieldPoint;
	state: FieldDragState;
}

interface XyInput {
	x: number | undefined;
	y: number | undefined;
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

	get readout(): boolean {
		return this.hasAttribute('readout');
	}

	set readout(isEnabled: boolean) {
		this.reflect('readout', isEnabled);
	}

	get x(): number {
		return this.#values.x.value;
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
		return this.#values.y.value;
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

	#mapped: Record<FieldAxis, ValueMapping> | undefined;

	readonly #parts: Record<FieldAxis, HTMLDivElement> = {
		x: requireChild(this.#xy, '[data-sonic-axis="x"]', HTMLDivElement),
		y: requireChild(this.#xy, '[data-sonic-axis="y"]', HTMLDivElement),
	};

	#pointerDrag: PointerDrag<XyDrag> | undefined;

	readonly #puck = requireChild(this.#xy, '.sonic-xy-puck', HTMLDivElement);

	readonly #readout = new Readout(requireChild(this.#xy, '.sonic-xy-readout', HTMLDivElement));

	readonly #values: Record<FieldAxis, AxisValue> = {
		x: { asked: undefined, value: 0 },
		y: { asked: undefined, value: 0 },
	};

	attributeChangedCallback(name: string): void {
		this.#mapped = undefined;
		if (name === 'x' || name === 'y') {
			if (this.#pointerDrag?.current()) return;

			this.#values[name].asked = undefined;
		}
		if (name === 'disabled' && this.isDisabled()) this.#pointerDrag?.end();

		this.#refresh();
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
		for (const axis of axes) this.#values[axis].asked = undefined;

		this.#refresh();
	}

	protected connect(signal: AbortSignal): void {
		const xy = this.#xy;

		this.keepControl(xy, signal);
		this.render();
		this.checkStyles(xy, 'xy.css');
		this.#bindPointer(xy, signal);
		this.#bindKeys(xy, signal);
	}

	protected override focusTarget(): HTMLElement {
		return this.#parts[this.#currentAxis];
	}

	protected render(): void {
		if (!this.isBound()) return;

		const { style } = this.#xy;
		const mappings = this.#mappings();

		for (const axis of axes) {
			const mapping = mappings[axis];
			const origin = this.optionalNumberAttribute(`${axis}-origin`) ?? mapping.bounds[0];

			style.setProperty(
				`--_sonic-xy-${axis}`,
				String(mapping.proportionOf(this.#values[axis].value)),
			);
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
					if (this.isDisabled() || isMenuPress(event)) return;

					focusByPointer(this.focusTarget());
					if (!isResetPress(event)) return this.#grab(event);

					this.#reset();

					return;
				},
				move: (drag, event) => {
					const step = stepFieldDrag(this.#mappings(), drag.state, pointerMove(event));

					drag.state = step.state;
					if (step.state.isEngaged) this.#claim.reveal('drag');
					if (!this.#input(step)) this.#renderReadout();
				},
				release: (drag) => {
					this.#claim.press(false);
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
		const mappings = this.#mappings();
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

		if (!isOnPuck)
			this.#input({ x: mappings.x.valueAt(pressed.x), y: mappings.y.valueAt(pressed.y) });
		this.#claim.press(true);

		const start = (axis: FieldAxis) => ({
			from: this.#values[axis].value,
			mapping: mappings[axis],
			proportion: isOnPuck
				? mappings[axis].proportionOf(this.#values[axis].value)
				: clampProportion(pressed[axis]),
			travelPx: travel[axis],
		});

		return {
			from,
			state: startFieldDrag({
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

	#keyTo(axis: FieldAxis, key: string): void {
		const next = this.#mappings()[axis].keyTarget(key, this.#values[axis].value);
		const hasMoved = this.#set(axis, next ?? NaN);

		this.#currentAxis = axis;
		this.render();
		this.#parts[axis].focus();
		if (!hasMoved) return;

		this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#mapping(axis: FieldAxis): ValueMapping {
		const midpoint = this.optionalNumberAttribute(`${axis}-midpoint`);

		return valueMapping({
			max: this.numberAttribute(`${axis}-max`, 100),
			...(midpoint === undefined ? {} : { midpoint }),
			isNotched: false,
			isWrapping: false,
			min: this.numberAttribute(`${axis}-min`, 0),
			step: this.numberAttribute(`${axis}-step`, 1),
			taper: this.#taper(axis),
		});
	}

	#mappings(): Record<FieldAxis, ValueMapping> {
		if (this.#mapped) return this.#mapped;

		this.#mapped = { x: this.#mapping('x'), y: this.#mapping('y') };

		return this.#mapped;
	}

	#refresh(): void {
		const mappings = this.#mappings();

		for (const axis of axes) {
			const axisValue = this.#values[axis];
			const mapping = mappings[axis];

			axisValue.value = mapping.snap(
				axisValue.asked ?? this.numberAttribute(axis, mapping.bounds[0]),
			);
		}
		this.render();
	}

	#renderAria(): void {
		const mappings = this.#mappings();
		const isDisabled = this.isDisabled();

		for (const axis of axes) {
			const part = this.#parts[axis];
			const [low, high] = mappings[axis].bounds;
			const isCurrent = axis === this.#currentAxis;
			const stop = isCurrent ? '0' : '-1';

			writeAttribute(part, 'aria-orientation', orientations[axis]);
			writeAttribute(part, 'aria-valuemin', String(low));
			writeAttribute(part, 'aria-valuemax', String(high));
			writeAttribute(part, 'aria-valuenow', String(this.#values[axis].value));
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

	#set(axis: FieldAxis, next: number): boolean {
		if (!Number.isFinite(next)) return false;

		const axisValue = this.#values[axis];
		const snapped = this.#mappings()[axis].snap(next);

		axisValue.asked = snapped;
		if (snapped === axisValue.value) return false;

		axisValue.value = snapped;

		return true;
	}

	#taper(axis: FieldAxis): ValueSpec['taper'] {
		return this.getAttribute(`${axis}-taper`) === 'log' ? 'log' : 'linear';
	}

	#valueText(axis: FieldAxis): string {
		return `${this.#axisText(axis)}, ${this.#axisText(axis === 'x' ? 'y' : 'x')}`;
	}

	#write(axis: FieldAxis, next: null | number | undefined): void {
		if (this.#pointerDrag?.current()) return;

		const axisValue = this.#values[axis];

		// A framework removes a prop by setting the property to `undefined`
		if (next === undefined || next === null) {
			axisValue.asked = undefined;
			this.#refresh();
			return;
		}

		const asked = toNumber(next);
		const hasMoved = this.#set(axis, asked);

		if (Number.isFinite(asked)) axisValue.asked = asked;
		if (hasMoved) this.render();
	}
}
