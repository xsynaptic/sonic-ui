import { attachSlot } from '#lib/render.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

// Replaced at build: `true` in the `development` tree, `false` in the default one
// eslint-disable-next-line unicorn/consistent-boolean-name -- the name bundlers and other kits use
declare const __DEV__: boolean;

// Forwarding another attribute is a public API decision
const namingAttributes = ['aria-describedby', 'aria-label', 'aria-labelledby'];

const checkedClasses = new WeakSet<object>();

// Rewriting the same labels on every render would churn the attribute through a drag
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
	copy: (originals: Array<ChildNode>) => void;
	// Children left out render beside the control, as they are
	isCopied?: (child: Node) => boolean;
}

// eslint-disable-next-line wc/define-tag-after-class-definition -- abstract, so only its subclasses are ever defined
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

	#slot: HTMLSlotElement | undefined;

	override blur(): void {
		this.#focused()?.blur();
	}

	connectedCallback(): void {
		this.upgradeProperties('disabled');
		if (this.#connection) return;

		const connection = new AbortController();

		// A throw leaves nothing bound behind it
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

	// As `delegatesFocus` does, focus already inside the control stays where it is
	override focus(options?: FocusOptions): void {
		const target = this.focusTarget();
		if (!target) {
			super.focus(options);
			return;
		}

		if (!this.isDisabled() && !this.#focused()) target.focus(options);
	}

	protected appendOnce(child: Element): void {
		if (child.parentNode !== this) this.append(child);
	}

	// A missing sheet draws the control blank without an error
	protected checkStyles(control: HTMLElement, sheet: string): void {
		if (!__DEV__) return;

		const elementClass = this.constructor;
		if (checkedClasses.has(elementClass)) return;

		checkedClasses.add(elementClass);
		requestAnimationFrame(() => {
			// A detached control computes no styles
			if (!control.isConnected) {
				checkedClasses.delete(elementClass);
				return;
			}

			const styles = getComputedStyle(control);
			const missing = [
				styles.getPropertyValue('--_sonic-unlit') === '' ? 'material.css' : '',
				styles.getPropertyValue('--_sonic-unit') === '' ? sheet : '',
			].filter(Boolean);
			if (missing.length === 0) return;

			console.warn(
				`<${this.localName}> draws blank without ${missing.map((file) => `@xsynaptic/sonic-ui/${file}`).join(' and ')} (or controls.css)`,
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

	// A framework keeps editing the children it owns, so the control copies them rather than taking them
	protected mirrorChildren(
		{ control, copy, isCopied = () => true }: Mirror,
		signal: AbortSignal,
	): void {
		const slot = this.#slot ?? attachSlot(this);

		this.#slot = slot;
		const mirror = (): void => {
			const children = [...this.childNodes].filter((child) => child !== control);

			copy(children.filter((child) => isCopied(child)));
			this.appendOnce(control);
			slot.assign(
				...children.filter(
					(child): child is Element | Text =>
						(child instanceof Element || child instanceof Text) && !isCopied(child),
				),
				control,
			);
		};
		const observer = new MutationObserver((records) => {
			if (records.some((record) => this.#isCopiedChange(record, control, isCopied))) mirror();
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
		if (attribute === null) return fallback;

		const parsed = Number(attribute);

		return Number.isFinite(parsed) ? parsed : fallback;
	}

	protected optionalNumberAttribute(name: string): number | undefined {
		const value = this.numberAttribute(name, NaN);

		return Number.isNaN(value) ? undefined : value;
	}

	// `undefined`, `null` and `false` remove the attribute, as the Lit kits reflect
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

			// The control's own arrival, or every mirror would run twice
			return (
				record.removedNodes.length > 0 || [...record.addedNodes].some((node) => node !== control)
			);
		}

		// A node removed since keeps reporting until delivery, and belongs to no child
		const child = this.#childHolding(record.target);

		if (child === undefined || child === control) return false;

		// A child's own attribute can move it out of the copies, which `isCopied` no longer sees
		return isCopied(child) || (record.type === 'attributes' && record.target === child);
	}
}
