import type { BoxProbe } from '#lib/check-styles.ts';

import { checkStyles } from '#lib/check-styles.ts';
import { toNumber } from '#lib/math.ts';
import { appendOnce, checkChildren } from '#lib/owned-control.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

declare const __DEV__: boolean;

const namingAttributes = ['aria-describedby', 'aria-label', 'aria-labelledby'];

const canReferElements = 'ariaLabelledByElements' in Element.prototype;

function writeLabelledBy(target: Element, labels: Array<Element>): void {
	const current = target.ariaLabelledByElements;
	if (
		current?.length === labels.length &&
		labels.every((label, index) => label === current[index])
	) {
		return;
	}

	target.ariaLabelledByElements = labels;
}

// eslint-disable-next-line wc/define-tag-after-class-definition -- abstract; only subclasses are defined
export abstract class SonicElement extends HTMLElement {
	static readonly observedAttributes = [...namingAttributes, 'disabled'];

	static #labelCount = 0;

	get disabled(): boolean {
		return this.hasAttribute('disabled');
	}

	set disabled(isDisabled: boolean) {
		this.reflect('disabled', isDisabled);
	}

	declare protected readonly boxProbe: BoxProbe | undefined;

	declare protected readonly control: HTMLElement | undefined;

	// happy-dom has no `ElementInternals`
	protected readonly internals =
		'attachInternals' in HTMLElement.prototype ? this.attachInternals() : undefined;

	declare protected readonly sheet: string | undefined;

	#connection: AbortController | undefined;

	readonly #states = new Set<string>();

	static #labelId(label: Element): string {
		if (label.id === '') {
			SonicElement.#labelCount += 1;
			label.id = `sonic-label-${String(SonicElement.#labelCount)}`;
		}

		return label.id;
	}

	override blur(): void {
		this.#focused()?.blur();
	}

	connectedCallback(): void {
		this.upgradeProperties('disabled');
		if (this.#connection) return;

		const connection = new AbortController();

		this.#connection = connection;
		try {
			this.connect(connection.signal);
		} catch (error) {
			connection.abort();
			this.#connection = undefined;
			throw error;
		}

		const { boxProbe: box, control, sheet } = this;

		if (__DEV__ && control && sheet !== undefined) checkStyles(this, { box, control, sheet });
	}

	connectedMoveCallback(): void {
		// Defined so `moveBefore` from a persisting router keeps every binding
	}

	// Without `moveBefore` (Safari), a persisting router disconnects and reconnects in one task
	disconnectedCallback(): void {
		const connection = this.#connection;
		if (!connection) return;

		queueMicrotask(() => {
			if (this.isConnected || this.#connection !== connection) return;

			connection.abort();
			this.#connection = undefined;
		});
	}

	override focus(options?: FocusOptions): void {
		const target = this.focusTarget();
		if (!target) {
			super.focus(options);
			return;
		}

		if (!this.isDisabled() && !this.#focused()) target.focus(options);
	}

	protected abstract connect(signal: AbortSignal): void;

	protected focusTarget(): HTMLElement | undefined {
		return undefined;
	}

	protected forwardNaming(target: Element, isNamed: boolean): void {
		const labels = isNamed ? this.namingLabels() : [];

		for (const name of namingAttributes) {
			// `ariaLabelledByElements` holds the attribute, empty
			if (name === 'aria-labelledby' && labels.length > 0) continue;

			const value = this.getAttribute(name);

			writeAttribute(target, name, isNamed && value !== null ? value : undefined);
		}
		if (labels.length > 0) this.#writeLabels(target, labels);
	}

	protected hasState(state: string): boolean {
		return this.#states.has(state);
	}

	// happy-dom matches `:disabled` on no custom element, and an element not form-associated never matches
	protected isBound(): boolean {
		return this.#connection !== undefined;
	}

	protected isDisabled(): boolean {
		return this.disabled || this.matches(':disabled');
	}

	// A morph against server HTML, or a stray `innerHTML`, deletes the control
	protected keepControl(signal: AbortSignal): void {
		const control = this.control;
		if (!control) return;

		const keep = (): void => {
			appendOnce(this, control);
			if (__DEV__)
				checkChildren(
					this,
					[...this.childNodes].filter((child) => child !== control && !this.usesChild(child)),
				);
		};
		const observer = new MutationObserver(keep);

		keep();
		observer.observe(this, { childList: true });
		signal.addEventListener(
			'abort',
			() => {
				observer.disconnect();
			},
			{ once: true },
		);
	}

	protected namingLabels(): Array<Element> {
		return [];
	}

	protected numberAttribute(name: string, fallback: number): number {
		const parsed = toNumber(this.getAttribute(name));

		return Number.isFinite(parsed) ? parsed : fallback;
	}

	protected optionalNumberAttribute(name: string): number | undefined {
		const value = this.numberAttribute(name, NaN);

		return Number.isNaN(value) ? undefined : value;
	}

	// Never compared; a host attribute set again resets the value a gesture left dirty
	protected reflect(name: string, value: boolean | null | number | string | undefined): void {
		if (typeof value !== 'number' && typeof value !== 'string' && value !== true) {
			this.removeAttribute(name);
			return;
		}

		this.setAttribute(name, value === true ? '' : value.toString());
	}

	protected stateTarget(): Element | undefined {
		return this.control;
	}

	protected toggleState(state: string, isOn: boolean): void {
		if (isOn) this.#states.add(state);
		else this.#states.delete(state);
		this.stateTarget()?.toggleAttribute(`data-sonic-${state}`, isOn);
	}

	// A property set before upgrade shadows its accessor
	protected upgradeProperties(...names: Array<keyof this>): void {
		for (const name of names) {
			if (!Object.hasOwn(this, name)) continue;

			const value = this[name];

			Reflect.deleteProperty(this, name);
			this[name] = value;
		}
	}

	protected usesChild(_child: Node): boolean {
		return false;
	}

	#focused(): HTMLElement | undefined {
		const root = this.getRootNode();
		const active =
			root instanceof ShadowRoot ? root.activeElement : this.ownerDocument.activeElement;

		return active instanceof HTMLElement && this.contains(active) ? active : undefined;
	}

	#writeLabels(target: Element, labels: Array<Element>): void {
		if (canReferElements) {
			writeLabelledBy(target, labels);
			return;
		}

		const ids = labels.map((label) => SonicElement.#labelId(label));

		writeAttribute(target, 'aria-labelledby', ids.join(' '));
	}
}
