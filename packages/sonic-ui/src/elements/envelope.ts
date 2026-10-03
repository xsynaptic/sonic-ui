import type { RangeLink } from '#elements/range-element.ts';
import type { AdsrBends, AdsrPlaces, AdsrShape } from '#lib/adsr-shape.ts';
import type { PlaneAxis, PlaneDragState, PlanePoint, PlaneScales } from '#lib/plane.ts';
import type { PointerDrag } from '#lib/pointer-drag.ts';

import { linkRange, SonicRangeElement } from '#elements/range-element.ts';
import { SonicElement } from '#elements/sonic-element.ts';
import { adsrPath, adsrShape, adsrStages, timeStages } from '#lib/adsr-shape.ts';
import { dragThresholdPx } from '#lib/drag-step.ts';
import { pointerMove, pointerPosition, startPlaneDrag, stepPlaneDrag } from '#lib/plane.ts';
import { bindDrag } from '#lib/pointer-drag.ts';
import { requireChild, template } from '#lib/render.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

// eslint-disable-next-line unicorn/consistent-boolean-name -- the name bundlers and other kits use
declare const __DEV__: boolean;

declare global {
	interface HTMLElementTagNameMap {
		'sonic-envelope': SonicEnvelope;
	}
}

interface Binding {
	element: SonicRangeElement;
	link: RangeLink;
	unwatch: () => void;
}

interface Drive {
	axis: PlaneAxis;
	binding: Binding;
}

interface HandleDrag {
	drives: Array<Drive & { from: number }>;
	isFlipped: boolean;
	state: PlaneDragState;
}

const curveStages = ['attack', 'decay', 'release'] as const;

const bindable = [...adsrStages, 'attack-curve', 'decay-curve', 'release-curve'] as const;

const bindableNames = new Set<string>(bindable);

function flip<Point extends PlanePoint>(point: Point, isFlipped: boolean): Point {
	return isFlipped ? { ...point, y: -point.y } : point;
}

function isParent(node: Node): node is Node & ParentNode {
	return 'querySelector' in node;
}

const renderEnvelope = template(
	/* HTML */ `
		<div class="sonic-envelope" aria-hidden="true">
			<svg class="sonic-envelope-graph" preserveAspectRatio="none" viewBox="0 0 1 1">
				<path class="sonic-envelope-fill" />
				<path class="sonic-envelope-line" />
			</svg>
			<div class="sonic-envelope-handle" data-sonic-stage="delay" hidden></div>
			<div class="sonic-envelope-handle" data-sonic-stage="attack" hidden></div>
			<div class="sonic-envelope-handle" data-sonic-stage="hold" hidden></div>
			<div class="sonic-envelope-handle" data-sonic-stage="decay" hidden></div>
			<div class="sonic-envelope-handle" data-sonic-stage="release" hidden></div>
			<div class="sonic-envelope-dot" data-sonic-stage="attack" hidden></div>
			<div class="sonic-envelope-dot" data-sonic-stage="decay" hidden></div>
			<div class="sonic-envelope-dot" data-sonic-stage="release" hidden></div>
		</div>
	`,
	HTMLDivElement,
);

export class SonicEnvelope extends SonicElement {
	static override readonly observedAttributes = [...SonicElement.observedAttributes, ...bindable];

	get attack(): string {
		return this.getAttribute('attack') ?? '';
	}

	set attack(id: string | undefined) {
		this.reflect('attack', id);
	}

	get attackCurve(): string {
		return this.getAttribute('attack-curve') ?? '';
	}

	set attackCurve(id: string | undefined) {
		this.reflect('attack-curve', id);
	}

	get decay(): string {
		return this.getAttribute('decay') ?? '';
	}

	set decay(id: string | undefined) {
		this.reflect('decay', id);
	}

	get decayCurve(): string {
		return this.getAttribute('decay-curve') ?? '';
	}

	set decayCurve(id: string | undefined) {
		this.reflect('decay-curve', id);
	}

	get delay(): string {
		return this.getAttribute('delay') ?? '';
	}

	set delay(id: string | undefined) {
		this.reflect('delay', id);
	}

	get hold(): string {
		return this.getAttribute('hold') ?? '';
	}

	set hold(id: string | undefined) {
		this.reflect('hold', id);
	}

	get release(): string {
		return this.getAttribute('release') ?? '';
	}

	set release(id: string | undefined) {
		this.reflect('release', id);
	}

	get releaseCurve(): string {
		return this.getAttribute('release-curve') ?? '';
	}

	set releaseCurve(id: string | undefined) {
		this.reflect('release-curve', id);
	}

	get sustain(): string {
		return this.getAttribute('sustain') ?? '';
	}

	set sustain(id: string | undefined) {
		this.reflect('sustain', id);
	}

	readonly #bindings = new Map<string, Binding>();

	readonly #envelope = renderEnvelope();

	readonly #fill = requireChild(this.#envelope, '.sonic-envelope-fill', SVGElement);

	readonly #graph = requireChild(this.#envelope, '.sonic-envelope-graph', SVGElement);

	readonly #line = requireChild(this.#envelope, '.sonic-envelope-line', SVGElement);

	#pointerDrag: PointerDrag<HandleDrag> | undefined;

	#shape: AdsrShape = adsrShape({});

	#signal: AbortSignal | undefined;

	readonly #waiting = new Set<unknown>();

	readonly #warned = new Set<string>();

	attributeChangedCallback(name: string): void {
		if (!this.#signal) return;
		if (name === 'disabled') {
			this.#pointerDrag?.end();
			this.#draw();
			return;
		}
		if (bindableNames.has(name)) this.#bind();
	}

	override connectedCallback(): void {
		this.upgradeProperties(...adsrStages, 'attackCurve', 'decayCurve', 'releaseCurve');
		super.connectedCallback();
	}

	protected connect(signal: AbortSignal): void {
		const envelope = this.#envelope;

		this.#signal = signal;
		this.appendOnce(envelope);
		this.#bind();
		this.checkStyles(envelope, 'envelope.css');
		this.#bindPointer(envelope, signal);
		signal.addEventListener(
			'abort',
			() => {
				this.#signal = undefined;
				this.#unbind();
			},
			{ once: true },
		);
	}

	#bind(): void {
		this.#pointerDrag?.end();
		this.#unbind();
		for (const name of bindable) {
			const element = this.#resolve(name);
			if (!element) continue;

			const link = linkRange(element);
			const unwatch = link.watch(() => {
				this.#draw();
			});

			this.#bindings.set(name, { element, link, unwatch });
		}
		this.#draw();
	}

	#bindPointer(envelope: HTMLElement, signal: AbortSignal): void {
		this.#pointerDrag = bindDrag(
			envelope,
			{
				cancel: (drag) => {
					for (const { binding, from } of drag.drives) binding.link.input(from);
				},
				grab: (event) => this.#grab(event),
				move: (drag, event) => {
					this.#moveDrag(drag, event);
				},
				release: (drag) => {
					for (const { binding, from } of drag.drives) {
						if (binding.link.value() === from) continue;

						binding.element.dispatchEvent(new Event('change', { bubbles: true }));
					}
				},
				toggle: (isDragging) => {
					this.toggleState('dragging', isDragging);
				},
			},
			signal,
		);
	}

	#dotDrives(stage: string): Array<Drive> {
		const binding = this.#bindings.get(`${stage}-curve`);

		return binding ? [{ axis: 'y', binding }] : [];
	}

	#draw(): void {
		const shape = this.#readShape();
		const path = this.#bindings.size === 0 ? { fill: '', stroke: '' } : adsrPath(shape);

		this.#shape = shape;
		this.#line.setAttribute('d', path.stroke);
		this.#fill.setAttribute('d', path.fill);
		for (const stage of timeStages) {
			this.#drawPoint(`.sonic-envelope-handle[data-sonic-stage="${stage}"]`, {
				at: shape.handles.find((point) => point.stage === stage),
				drives: this.#drives(stage),
			});
		}
		for (const stage of curveStages) {
			this.#drawPoint(`.sonic-envelope-dot[data-sonic-stage="${stage}"]`, {
				at: shape.dots.find((point) => point.stage === stage),
				drives: this.#dotDrives(stage),
			});
		}
	}

	#drawPoint(selector: string, point: { at: PlanePoint | undefined; drives: Array<Drive> }): void {
		const part = requireChild(this.#envelope, selector, HTMLDivElement);
		const { at, drives } = point;

		part.hidden = !at;
		if (!at) return;

		const isStill = this.isDisabled() || drives.every(({ binding }) => binding.link.isDisabled());

		part.style.setProperty('--_sonic-envelope-x', String(at.x));
		part.style.setProperty('--_sonic-envelope-y', String(at.y));
		part.dataset.sonicAxes = drives.map(({ axis }) => axis).join('');
		writeAttribute(part, 'data-sonic-disabled', isStill ? '' : undefined);
	}

	#drives(stage: string): Array<Drive> {
		const x = this.#bindings.get(stage);
		const y = stage === 'decay' ? this.#bindings.get('sustain') : undefined;

		return [
			...(x ? [{ axis: 'x' as const, binding: x }] : []),
			...(y ? [{ axis: 'y' as const, binding: y }] : []),
		];
	}

	#grab(event: PointerEvent): HandleDrag | undefined {
		const pressed = this.#pressed(event);
		if (!pressed || pressed.drives.length === 0) return undefined;

		const { drives, isFlipped } = pressed;
		const box = this.#graph.getBoundingClientRect();
		const travel = { x: Math.max(1, box.width * this.#shape.share), y: Math.max(1, box.height) };
		const start = (axis: PlaneAxis) => {
			const link = drives.find((drive) => drive.axis === axis)?.binding.link;
			if (!link) return;

			const scale = link.scale();
			const from = link.value();

			return { from, place: scale.place(from), scale, travelPx: travel[axis] };
		};

		return {
			drives: drives.map((drive) => ({ ...drive, from: drive.binding.link.value() })),
			isFlipped,
			state: startPlaneDrag({
				position: flip(pointerPosition(event), isFlipped),
				thresholdPx: dragThresholdPx(event.pointerType),
				x: start('x'),
				y: start('y'),
			}),
		};
	}

	#moveDrag(drag: HandleDrag, event: PointerEvent): void {
		const scales: PlaneScales = {};

		for (const { axis, binding } of drag.drives) scales[axis] = binding.link.scale();

		const step = stepPlaneDrag(scales, drag.state, flip(pointerMove(event), drag.isFlipped));

		drag.state = step.state;
		for (const { axis, binding } of drag.drives) {
			const next = step[axis];

			if (next !== undefined) binding.link.input(next);
		}
	}

	#pressed(
		event: PointerEvent,
	): (Pick<HandleDrag, 'isFlipped'> & { drives: Array<Drive> }) | undefined {
		const part =
			event.target instanceof Element
				? event.target.closest<HTMLElement>('.sonic-envelope-handle, .sonic-envelope-dot')
				: undefined;
		const stage = part?.dataset.sonicStage;
		if (!part || stage === undefined || this.isDisabled()) return undefined;

		const isDot = part.classList.contains('sonic-envelope-dot');
		const drives = isDot ? this.#dotDrives(stage) : this.#drives(stage);

		return {
			drives: drives.filter(({ binding }) => !binding.link.isDisabled()),
			isFlipped: isDot && stage === 'attack',
		};
	}

	#readShape(): AdsrShape {
		const places: AdsrPlaces = {};
		const bends: AdsrBends = {};

		for (const stage of adsrStages) {
			const link = this.#bindings.get(stage)?.link;

			places[stage] = link?.scale().place(link.value());
		}
		for (const stage of curveStages) {
			bends[stage] = this.#bindings.get(`${stage}-curve`)?.link.value();
		}

		return adsrShape(places, bends);
	}

	#rebindOnce(key: unknown, arrives: (rebind: () => void) => void): void {
		if (this.#waiting.has(key)) return;

		this.#waiting.add(key);
		arrives(() => {
			this.#waiting.delete(key);
			if (this.#signal) this.#bind();
		});
	}

	#resolve(name: string): SonicRangeElement | undefined {
		const id = this.getAttribute(name);
		const root = this.getRootNode();
		if (!id || !isParent(root)) return undefined;

		const found = root.querySelector(`#${CSS.escape(id)}`);
		if (found instanceof SonicRangeElement) return found;

		this.#wait(id, found);

		return undefined;
	}

	#unbind(): void {
		for (const { unwatch } of this.#bindings.values()) unwatch();

		this.#bindings.clear();
	}

	#wait(id: string, found: Element | null): void {
		const tag = found?.localName;
		const { ownerDocument } = this;

		if (tag?.includes('-') && !customElements.get(tag)) {
			this.#rebindOnce(tag, (rebind) => {
				void customElements.whenDefined(tag).then(rebind);
			});
			return;
		}
		if (!found && ownerDocument.readyState === 'loading') {
			this.#rebindOnce(ownerDocument, (rebind) => {
				ownerDocument.addEventListener('DOMContentLoaded', rebind, { once: true });
			});
			return;
		}

		this.#warn(id);
	}

	#warn(id: string): void {
		if (!__DEV__) return;
		if (this.#warned.has(id)) return;

		this.#warned.add(id);
		console.warn(`<sonic-envelope> found no dial, slider or number box with the id "${id}"`);
	}
}
