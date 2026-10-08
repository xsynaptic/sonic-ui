import type { FieldGesture, FieldHold } from '#elements/field-gesture.ts';
import type { ValueLink } from '#elements/value-element.ts';
import type { AdsrCurves, AdsrProportions, AdsrShape } from '#lib/adsr-shape.ts';
import type { FieldAxis, FieldPoint } from '#lib/field.ts';

import { bindFieldGesture } from '#elements/field-gesture.ts';
import { ReadoutClaim } from '#elements/readout-claim.ts';
import { Readout } from '#elements/readout.ts';
import { SonicElement } from '#elements/sonic-element.ts';
import { linkValue, SonicValueElement } from '#elements/value-element.ts';
import { adsrPath, adsrShape, adsrStages, timeStages } from '#lib/adsr-shape.ts';
import { requireChild, template } from '#lib/render.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

declare const __DEV__: boolean;

declare global {
	interface HTMLElementTagNameMap {
		'sonic-envelope': SonicEnvelope;
	}
}

interface Binding {
	element: SonicValueElement;
	link: ValueLink;
	unwatch: () => void;
}

interface Drive {
	axis: FieldAxis;
	binding: Binding;
}

interface HandleHold extends FieldHold {
	drives: Array<Drive>;
	isFlipped: boolean;
	part: HTMLElement;
}

const curveStages = ['attack', 'decay', 'release'] as const;

const bindable = [...adsrStages, 'attack-curve', 'decay-curve', 'release-curve'] as const;

const bindableNames = new Set<string>(bindable);

function isParent(node: Node): node is Node & ParentNode {
	return 'querySelector' in node;
}

const emptyPath = { fill: '', floor: { from: 0, to: 0 }, stroke: '' };

function stageParts<Stage extends string>(
	envelope: Element,
	hook: string,
	stages: ReadonlyArray<Stage>,
): Map<Stage, HTMLDivElement> {
	return new Map(
		stages.map((stage) => [
			stage,
			requireChild(envelope, `.${hook}[data-sonic-stage="${stage}"]`, HTMLDivElement),
		]),
	);
}

const renderEnvelope = template(
	/* HTML */ `
		<div class="sonic-envelope" aria-hidden="true">
			<div class="sonic-envelope-bracket"></div>
			<svg class="sonic-envelope-graph" preserveAspectRatio="none" viewBox="0 0 1 1">
				<path class="sonic-envelope-fill" />
				<rect class="sonic-envelope-fill sonic-envelope-floor" y="1" />
				<path class="sonic-envelope-line" />
			</svg>
			<div class="sonic-envelope-handle" data-sonic-stage="delay" hidden></div>
			<div class="sonic-envelope-handle" data-sonic-stage="attack" hidden></div>
			<div class="sonic-envelope-handle" data-sonic-stage="hold" hidden></div>
			<div class="sonic-envelope-handle" data-sonic-stage="decay" hidden></div>
			<div class="sonic-envelope-handle" data-sonic-stage="release" hidden></div>
			<div class="sonic-envelope-curve" data-sonic-stage="attack" hidden></div>
			<div class="sonic-envelope-curve" data-sonic-stage="decay" hidden></div>
			<div class="sonic-envelope-curve" data-sonic-stage="release" hidden></div>
			<div class="sonic-envelope-readout" popover="manual"><span></span></div>
		</div>
	`,
	HTMLDivElement,
);

export class SonicEnvelope extends SonicElement {
	static override readonly observedAttributes = [
		...SonicElement.observedAttributes,
		...bindable,
		'readout',
	];

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

	// fallow-ignore-next-line code-duplication -- one accessor pair per property
	get pointerType(): string | undefined {
		return this.#gesture?.pointerType();
	}

	get readout(): boolean {
		return this.hasAttribute('readout');
	}

	set readout(isOn: boolean) {
		this.reflect('readout', isOn);
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

	readonly #bracket = requireChild(this.#envelope, '.sonic-envelope-bracket', HTMLDivElement);

	readonly #claim = new ReadoutClaim(() => {
		this.#renderReadout();
	});

	readonly #curveHandles = stageParts(this.#envelope, 'sonic-envelope-curve', curveStages);

	readonly #fill = requireChild(this.#envelope, '.sonic-envelope-fill', SVGElement);

	readonly #floor = requireChild(this.#envelope, '.sonic-envelope-floor', SVGElement);

	#gesture: FieldGesture<HandleHold> | undefined;

	readonly #graph = requireChild(this.#envelope, '.sonic-envelope-graph', SVGElement);

	readonly #handles = stageParts(this.#envelope, 'sonic-envelope-handle', timeStages);

	#held: HTMLElement | undefined;

	#isDriving = false;

	readonly #line = requireChild(this.#envelope, '.sonic-envelope-line', SVGElement);

	readonly #readout = new Readout(
		requireChild(this.#envelope, '.sonic-envelope-readout', HTMLDivElement),
	);

	#shape: AdsrShape = adsrShape({});

	readonly #waiting = new Set<unknown>();

	readonly #warned = new Set<string>();

	attributeChangedCallback(name: string): void {
		if (!this.isBound()) return;
		if (name === 'disabled') {
			this.#gesture?.end();
			this.#draw();
			return;
		}
		if (bindableNames.has(name)) this.#bind();
		else this.#renderReadout();
	}

	override connectedCallback(): void {
		this.upgradeProperties(...adsrStages, 'attackCurve', 'decayCurve', 'readout', 'releaseCurve');
		super.connectedCallback();
	}

	protected connect(signal: AbortSignal): void {
		const envelope = this.#envelope;

		this.keepControl(envelope, signal);
		this.#bind();
		if (__DEV__)
			this.checkStyles(envelope, 'envelope.css', {
				property: 'margin-bottom',
				selector: '[popover]',
			});
		this.#bindPointer(envelope, signal);
		signal.addEventListener(
			'abort',
			() => {
				this.#unbind();
			},
			{ once: true },
		);
	}

	#bind(): void {
		this.#gesture?.end();
		this.#unbind();
		for (const name of bindable) {
			const element = this.#resolve(name);
			if (!element) continue;

			const link = linkValue(element);
			const unwatch = link.model.watch(() => {
				if (!this.#isDriving) this.#draw();
			});

			this.#bindings.set(name, { element, link, unwatch });
		}
		this.#draw();
	}

	#bindPointer(envelope: HTMLElement, signal: AbortSignal): void {
		this.#gesture = bindFieldGesture(
			envelope,
			{
				claim: this.#claim,
				grab: (event) => this.#grab(event),
				input: ({ drives }, next) => {
					this.#isDriving = true;
					for (const { axis, binding } of drives) {
						const value = next[axis];

						if (value !== undefined) binding.link.input(value);
					}
					this.#isDriving = false;
					this.#draw();
				},
				release: ({ drives }, moved) => {
					for (const { axis, binding } of drives) {
						if (!moved.includes(axis)) continue;

						binding.link.change();
					}
				},
				toggle: (isDragging) => {
					this.toggleState('dragging', isDragging);
				},
			},
			signal,
		);
	}

	#curveDrives(stage: string): Array<Drive> {
		const binding = this.#bindings.get(`${stage}-curve`);

		return binding ? [{ axis: 'y', binding }] : [];
	}

	#draw(): void {
		const shape = this.#readShape();
		const path = this.#bindings.size === 0 ? emptyPath : adsrPath(shape);

		this.#shape = shape;
		writeAttribute(this.#line, 'd', path.stroke);
		writeAttribute(this.#fill, 'd', path.fill);
		writeAttribute(this.#floor, 'x', String(path.floor.from));
		writeAttribute(this.#floor, 'width', String(path.floor.to - path.floor.from));
		for (const [stage, part] of this.#handles) {
			this.#drawPoint(part, {
				at: shape.handles.find((point) => point.stage === stage),
				drives: this.#drives(stage),
			});
		}
		for (const [stage, part] of this.#curveHandles) {
			this.#drawPoint(part, {
				at: shape.curveHandles.find((point) => point.stage === stage),
				drives: this.#curveDrives(stage),
			});
		}
		this.#drawBracket();
		this.#renderReadout();
	}

	#drawBracket(): void {
		const part = this.#held;
		if (!part) return;

		for (const name of ['--_sonic-envelope-x', '--_sonic-envelope-y']) {
			this.#bracket.style.setProperty(name, part.style.getPropertyValue(name));
		}
		writeAttribute(
			this.#bracket,
			'data-sonic-part',
			part.classList.contains('sonic-envelope-curve') ? 'curve' : undefined,
		);
	}

	#drawPoint(
		part: HTMLDivElement,
		point: { at: FieldPoint | undefined; drives: Array<Drive> },
	): void {
		const { at, drives } = point;

		writeAttribute(part, 'hidden', at ? undefined : '');
		if (!at) return;

		const isStill = this.isDisabled() || drives.every(({ binding }) => binding.link.isDisabled());

		part.style.setProperty('--_sonic-envelope-x', String(at.x));
		part.style.setProperty('--_sonic-envelope-y', String(at.y));
		writeAttribute(part, 'data-sonic-axes', drives.map(({ axis }) => axis).join(''));
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

	#grab(event: PointerEvent): HandleHold | undefined {
		const pressed = this.#pressed(event);
		if (!pressed || pressed.drives.length === 0) return undefined;

		this.#held = pressed.part;
		this.#drawBracket();

		const box = this.#graph.getBoundingClientRect();
		const travel = { x: Math.max(1, box.width * this.#shape.share), y: Math.max(1, box.height) };
		const axes: HandleHold['axes'] = {};

		for (const { axis, binding } of pressed.drives) {
			axes[axis] = { model: binding.link.model, travelPx: travel[axis] };
		}

		return { ...pressed, axes };
	}

	#pressed(event: PointerEvent): Omit<HandleHold, 'axes'> | undefined {
		const part =
			event.target instanceof Element
				? event.target.closest<HTMLElement>('.sonic-envelope-handle, .sonic-envelope-curve')
				: undefined;
		const stage = part?.dataset.sonicStage;
		if (!part || stage === undefined || this.isDisabled()) return undefined;

		const isCurveHandle = part.classList.contains('sonic-envelope-curve');
		const drives = isCurveHandle ? this.#curveDrives(stage) : this.#drives(stage);

		return {
			drives: drives.filter(({ binding }) => !binding.link.isDisabled()),
			isFlipped: isCurveHandle && stage === 'attack',
			part,
		};
	}

	#readShape(): AdsrShape {
		const proportions: AdsrProportions = {};
		const curves: AdsrCurves = {};

		for (const stage of adsrStages) {
			const model = this.#bindings.get(stage)?.link.model;

			proportions[stage] = model?.mapping().proportionOf(model.value);
		}
		for (const stage of curveStages) {
			curves[stage] = this.#bindings.get(`${stage}-curve`)?.link.model.value;
		}

		return adsrShape(proportions, curves);
	}

	#rebindOnce(key: unknown, arrives: (rebind: () => void) => void): void {
		if (this.#waiting.has(key)) return;

		this.#waiting.add(key);
		arrives(() => {
			this.#waiting.delete(key);
			if (this.isBound()) this.#bind();
		});
	}

	#renderReadout(): void {
		const drag = this.#gesture?.current();

		if (!drag) {
			this.#readout.close();
			return;
		}

		this.#readout.show({
			anchor: drag.part,
			isOpen: this.#claim.isRevealed && this.readout,
			text: drag.drives.map(({ binding }) => binding.element.valueText).join(', '),
		});
	}

	#resolve(name: string): SonicValueElement | undefined {
		const id = this.getAttribute(name);
		const root = this.getRootNode();
		if (!id || !isParent(root)) return undefined;

		const found = root.querySelector(`#${CSS.escape(id)}`);
		if (found instanceof SonicValueElement) return found;

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
