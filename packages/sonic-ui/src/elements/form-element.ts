import { SonicElement } from '#elements/sonic-element.ts';

export abstract class SonicFormElement extends SonicElement {
	static readonly formAssociated = true;

	get form(): HTMLFormElement | null {
		// eslint-disable-next-line unicorn/no-null -- as on native inputs
		return this.internals?.form ?? null;
	}

	get labels(): NodeList | null {
		// eslint-disable-next-line unicorn/no-null -- as on native inputs
		return this.internals?.labels ?? null;
	}

	get name(): string {
		return this.getAttribute('name') ?? '';
	}

	set name(value: string | undefined) {
		this.reflect('name', value);
	}

	constructor() {
		super();

		// Otherwise the host takes the label's name and shows as a named generic beside the control
		if (this.internals) this.internals.role = 'none';

		// A click inside the control bubbles here with its own target; only a label's click targets the host
		this.addEventListener('click', (event) => {
			if (event.target === this) this.activate();
		});

		// No event fires when a label arrives, so focus picks it up
		this.addEventListener('focusin', () => {
			this.render();
		});
	}

	abstract attributeChangedCallback(name: string): void;

	override connectedCallback(): void {
		this.upgradeProperties('name');
		super.connectedCallback();
	}

	// Never writes the attribute, or re-enabling the fieldset would leave the control disabled
	formDisabledCallback(): void {
		this.attributeChangedCallback('disabled');
	}

	formResetCallback(): void {
		this.attributeChangedCallback('value');
	}

	// Firefox hands a restored state to the wrong control when tags upgrade out of document order
	formStateRestoreCallback(state: File | FormData | null | string): void {
		const prefix = `${this.localName}:`;

		if (typeof state === 'string' && state.startsWith(prefix)) {
			this.restoreState(state.slice(prefix.length));
		}
	}

	protected activate(): void {
		this.focus();
	}

	protected override namingLabels(): Array<Element> {
		const internals = this.internals;
		if (!internals || this.hasAttribute('aria-label') || this.hasAttribute('aria-labelledby')) {
			return [];
		}

		return [...internals.labels].filter((label) => label instanceof Element);
	}

	protected abstract render(): void;

	protected abstract restoreState(state: string): void;

	protected writeFormValue(value: FormData | null | string, state: string): void {
		this.internals?.setFormValue(value, `${this.localName}:${state}`);
	}
}
