import { toNumber } from '#lib/math.ts';
import { appendOnce, checkChildren } from '#lib/owned-control.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

// eslint-disable-next-line unicorn/consistent-boolean-name -- the name bundlers and other kits use
declare const __DEV__: boolean;

const namingAttributes = ['aria-describedby', 'aria-label', 'aria-labelledby'];

const checkedSheets = new WeakMap<object, Set<string>>();

interface StyleProbe {
	selector?: string;
	sheet: string;
	token: string;
}

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

	get disabled(): boolean {
		return this.hasAttribute('disabled');
	}

	set disabled(isDisabled: boolean) {
		this.reflect('disabled', isDisabled);
	}

	// happy-dom has no `ElementInternals`
	protected readonly internals =
		'attachInternals' in HTMLElement.prototype ? this.attachInternals() : undefined;

	#connection: AbortController | undefined;

	readonly #states = new Set<string>();

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

	protected checkStyles(control: HTMLElement, sheet: string): void {
		if (!__DEV__) return;

		const elementClass = this.constructor;
		const checked = checkedSheets.get(elementClass) ?? new Set<string>();
		const part = ({ selector }: StyleProbe): Element | undefined =>
			selector === undefined ? control : (this.querySelector(selector) ?? undefined);
		// An LED inherits `--_sonic-unit` from its control, so a token of its own probes it
		const probes: Array<StyleProbe> = [
			{ sheet: 'material.css', token: '--_sonic-unlit' },
			{ sheet, token: '--_sonic-unit' },
			{ selector: '.sonic-led', sheet: 'led.css', token: '--_sonic-led-lens-ratio' },
		].filter((probe) => !checked.has(probe.sheet) && part(probe) !== undefined);
		if (probes.length === 0) return;

		checkedSheets.set(elementClass, checked);
		for (const probe of probes) checked.add(probe.sheet);
		requestAnimationFrame(() => {
			const missing: Array<string> = [];

			for (const probe of probes) {
				const drawn = control.isConnected ? part(probe) : undefined;

				if (!drawn) checked.delete(probe.sheet);
				else if (getComputedStyle(drawn).getPropertyValue(probe.token) === '') {
					missing.push(`@xsynaptic/sonic-ui/${probe.sheet}`);
				}
			}
			if (missing.length === 0) return;

			console.warn(
				`<${this.localName}> draws blank without ${missing.join(' and ')} (or controls.css)`,
			);
		});
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
		if (labels.length > 0) writeLabelledBy(target, labels);
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
	protected keepControl(control: Element, signal: AbortSignal): void {
		const keep = (): void => {
			appendOnce(this, control);
			if (__DEV__)
				checkChildren(
					this,
					[...this.childNodes].filter((child) => child !== control),
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

	protected toggleState(state: string, isOn: boolean): void {
		if (isOn) {
			this.#states.add(state);
			this.internals?.states.add(state);
			return;
		}

		this.#states.delete(state);
		this.internals?.states.delete(state);
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

	#focused(): HTMLElement | undefined {
		const root = this.getRootNode();
		const active =
			root instanceof ShadowRoot ? root.activeElement : this.ownerDocument.activeElement;

		return active instanceof HTMLElement && this.contains(active) ? active : undefined;
	}
}
