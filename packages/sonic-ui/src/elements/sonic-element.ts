import type { MirrorSlots } from '#lib/render.ts';

import { attachSlots } from '#lib/render.ts';
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

interface Mirror {
	control: Element;
	copy: (original: ChildNode) => Node | undefined;
	isCopied?: (child: Node) => boolean;
	place: (copies: Array<Node>) => void;
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

	#slots: MirrorSlots | undefined;

	override blur(): void {
		this.#focused()?.blur();
	}

	connectedCallback(): void {
		this.upgradeProperties('disabled');
		if (this.#connection) return;

		const connection = new AbortController();

		try {
			this.connect(connection.signal);
		} catch (error) {
			connection.abort();
			throw error;
		}

		this.#connection = connection;
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

	protected appendOnce(control: Element): void {
		const [hook] = control.classList;
		const stale = [...this.children].filter(
			(child) => child !== control && hook !== undefined && child.classList.contains(hook),
		);

		for (const child of stale) child.remove();
		if (control.parentNode !== this) this.append(control);
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

	// happy-dom matches `:disabled` on no custom element, and an element not form-associated never matches
	protected isDisabled(): boolean {
		return this.disabled || this.matches(':disabled');
	}

	protected mirrorChildren(
		{ control, copy, isCopied = () => true, place }: Mirror,
		signal: AbortSignal,
	): void {
		const slots = this.#slots ?? attachSlots(this);
		let copies = new Map<ChildNode, Node | undefined>();

		this.#slots = slots;
		const mirror = (touched?: Set<Node | undefined>): void => {
			this.appendOnce(control);

			const children = [...this.childNodes].filter((child) => child !== control);
			const slotted = children.filter(
				(child): child is Element | Text => child instanceof Element || child instanceof Text,
			);
			const kept = copies;

			copies = new Map(
				children
					.filter((child) => isCopied(child))
					.map((original) => [
						original,
						touched && !touched.has(original) && kept.has(original)
							? kept.get(original)
							: copy(original),
					]),
			);
			place([...copies.values()].filter((made) => made !== undefined));
			slots.shown.assign(...slotted.filter((child) => !isCopied(child)), control);
			slots.kept.assign(...slotted.filter((child) => isCopied(child)));
		};
		const observer = new MutationObserver((records) => {
			const changes = records.filter((record) => this.#isCopiedChange(record, control, isCopied));
			if (changes.length === 0) return;

			if (changes.some((record) => record.target === this)) mirror();
			else mirror(new Set(changes.map((record) => this.#childHolding(record.target))));
		});

		mirror();
		observer.observe(this, {
			attributes: true,
			characterData: true,
			childList: true,
			subtree: true,
		});
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
		const attribute = this.getAttribute(name);
		if (attribute === null || attribute.trim() === '') return fallback;

		const parsed = Number(attribute);

		return Number.isFinite(parsed) ? parsed : fallback;
	}

	protected optionalNumberAttribute(name: string): number | undefined {
		const value = this.numberAttribute(name, NaN);

		return Number.isNaN(value) ? undefined : value;
	}

	protected reflect(name: string, value: boolean | null | number | string | undefined): void {
		if (value === true) {
			this.setAttribute(name, '');
			return;
		}

		writeAttribute(this, name, value === false || value === null ? undefined : value?.toString());
	}

	protected toggleState(state: string, isOn: boolean): void {
		if (isOn) this.internals?.states.add(state);
		else this.internals?.states.delete(state);
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

	#childHolding(node: Node): Node | undefined {
		let current: Node | null = node;

		while (current && current.parentNode !== this) current = current.parentNode;

		return current ?? undefined;
	}

	#focused(): HTMLElement | undefined {
		const root = this.getRootNode();
		const active =
			root instanceof ShadowRoot ? root.activeElement : this.ownerDocument.activeElement;

		return active instanceof HTMLElement && this.contains(active) ? active : undefined;
	}

	#isCopiedChange(
		record: MutationRecord,
		control: Element,
		isCopied: (child: Node) => boolean,
	): boolean {
		if (record.target === this) {
			if (record.type === 'attributes') return false;

			return (
				record.removedNodes.length > 0 || [...record.addedNodes].some((node) => node !== control)
			);
		}

		const child = this.#childHolding(record.target);

		if (child === undefined || child === control) return false;

		return isCopied(child) || (record.type === 'attributes' && record.target === child);
	}
}
