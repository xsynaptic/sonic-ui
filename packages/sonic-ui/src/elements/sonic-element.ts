import { writeAttribute } from '#lib/write-attribute.ts';

// Forwarding another attribute is a public API decision
const namingAttributes = ['aria-describedby', 'aria-label', 'aria-labelledby'];

const checkedClasses = new WeakSet<object>();

// eslint-disable-next-line wc/define-tag-after-class-definition -- abstract, so only its subclasses are ever defined
export abstract class SonicElement extends HTMLElement {
	static readonly observedAttributes = [...namingAttributes, 'disabled'];

	get disabled(): boolean {
		return this.hasAttribute('disabled');
	}

	set disabled(isDisabled: boolean) {
		this.toggleAttribute('disabled', isDisabled);
	}

	#connection: AbortController | undefined;

	// happy-dom has no `ElementInternals`
	readonly #internals =
		'attachInternals' in HTMLElement.prototype ? this.attachInternals() : undefined;

	connectedCallback(): void {
		this.upgradeProperty('disabled');
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

	// Replacing the host's children takes the control with them, so `adopt` runs on every change
	protected adoptChildren(adopt: () => void, signal: AbortSignal): void {
		const observer = new MutationObserver(adopt);

		adopt();
		observer.observe(this, { childList: true });
		signal.addEventListener(
			'abort',
			() => {
				observer.disconnect();
			},
			{ once: true },
		);
	}

	protected appendOnce(child: Element): void {
		if (child.parentNode !== this) this.append(child);
	}

	// A missing sheet draws the control blank without an error
	protected checkStyles(control: HTMLElement, sheet: string): void {
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

	protected forwardNaming(target: Element, isNamed: boolean): void {
		for (const name of namingAttributes) {
			const value = this.getAttribute(name);

			writeAttribute(target, name, isNamed && value !== null ? value : undefined);
		}
	}

	protected numberAttribute(name: string, fallback: number): number {
		const attribute = this.getAttribute(name);
		if (attribute === null) return fallback;

		const parsed = Number(attribute);

		return Number.isFinite(parsed) ? parsed : fallback;
	}

	protected toggleState(state: string, isOn: boolean): void {
		if (isOn) this.#internals?.states.add(state);
		else this.#internals?.states.delete(state);
	}

	// A property set before upgrade shadows its accessor
	protected upgradeProperty(name: keyof this): void {
		if (!Object.hasOwn(this, name)) return;

		const value = this[name];

		Reflect.deleteProperty(this, name);
		this[name] = value;
	}
}
