import { SonicFormElement } from '#elements/form-element.ts';
import { copyNode } from '#lib/copy-node.ts';
import { bindHoldRelease } from '#lib/hold.ts';
import { requireChild, template } from '#lib/render.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-key': SonicKey;
	}
}

const renderKey = template(
	/* HTML */ `
		<button class="sonic-key" type="button"><span class="sonic-key-cap"></span></button>
	`,
	HTMLButtonElement,
);

const holdKeys = new Set([' ', 'Enter']);

export class SonicKey extends SonicFormElement {
	static override readonly observedAttributes = [
		...SonicFormElement.observedAttributes,
		'busy',
		'momentary',
		'pressed',
		'soft-disabled',
		'toggle',
		'value',
	];

	get busy(): boolean {
		return this.hasAttribute('busy');
	}

	set busy(isBusy: boolean) {
		this.reflect('busy', isBusy);
	}

	// The `pressed` attribute, as `defaultChecked` holds a checkbox's `checked` attribute
	get defaultPressed(): boolean {
		return this.hasAttribute('pressed');
	}

	set defaultPressed(isPressed: boolean) {
		this.reflect('pressed', isPressed);
	}

	get momentary(): boolean {
		return this.hasAttribute('momentary');
	}

	set momentary(isMomentary: boolean) {
		this.reflect('momentary', isMomentary);
	}

	// The live state, which never writes the attribute, as `value` on the range
	get pressed(): boolean {
		return this.#isDirty ? this.#pressed : this.defaultPressed;
	}

	set pressed(isPressed: boolean | undefined) {
		this.#isDirty = true;
		this.#pressed = isPressed === true;
		this.render();
	}

	get softDisabled(): boolean {
		return this.hasAttribute('soft-disabled');
	}

	set softDisabled(isSoftDisabled: boolean) {
		this.reflect('soft-disabled', isSoftDisabled);
	}

	get toggle(): boolean {
		return this.hasAttribute('toggle');
	}

	set toggle(isToggle: boolean) {
		this.reflect('toggle', isToggle);
	}

	// What a pressed toggle submits, reading `on` while unset as a checkbox does
	get value(): string {
		return this.getAttribute('value') ?? 'on';
	}

	set value(value: string | undefined) {
		this.reflect('value', value);
	}

	#holder: number | string | undefined;

	// Re-read from the attribute until a press or a write
	// An attribute write clears it, so a framework driving `pressed` keeps control
	#isDirty = false;

	readonly #key = renderKey();

	#pressed = false;

	attributeChangedCallback(name: string): void {
		if (name === 'pressed') this.#isDirty = false;
		if (this.isDisabled() || this.#isSoftDisabled()) this.#release();
		this.render();
	}

	// Back to the `pressed` attribute, as a checkbox resets to `checked`
	override formResetCallback(): void {
		this.attributeChangedCallback('pressed');
	}

	// As a checkbox's label toggles it
	protected override activate(): void {
		this.#key.click();
	}

	protected connect(signal: AbortSignal): void {
		const key = this.#key;
		const cap = requireChild(key, '.sonic-key-cap', HTMLSpanElement);

		this.upgradeProperties(
			'busy',
			'defaultPressed',
			'momentary',
			'softDisabled',
			'toggle',
			'pressed',
			'value',
		);
		this.mirrorChildren(
			{
				control: key,
				copy: (originals) => {
					cap.replaceChildren(...originals.map((original) => copyNode(original)));
				},
			},
			signal,
		);
		this.render();
		this.checkStyles(key, 'key.css');
		signal.addEventListener(
			'abort',
			() => {
				this.#release();
			},
			{ once: true },
		);

		key.addEventListener(
			'click',
			(event) => {
				// A native disabled button fires no click at all
				if (this.#isSoftDisabled()) {
					event.preventDefault();
					event.stopImmediatePropagation();
					return;
				}
				if (!this.toggle) return;

				this.pressed = !this.pressed;
				this.dispatchEvent(new Event('change', { bubbles: true }));
			},
			{ signal },
		);
		this.#bindMomentary(key, signal);
	}

	protected override focusTarget(): HTMLElement {
		return this.#key;
	}

	protected render(): void {
		const key = this.#key;

		key.disabled = this.isDisabled();
		writeAttribute(key, 'aria-disabled', this.#isSoftDisabled() ? 'true' : undefined);
		writeAttribute(key, 'aria-busy', this.busy ? 'true' : undefined);
		key.removeAttribute('aria-pressed');
		if (this.toggle) key.setAttribute('aria-pressed', String(this.pressed));
		this.toggleState('pressed', this.pressed);
		this.forwardNaming(key, true);

		// eslint-disable-next-line unicorn/no-null -- `null` submits nothing
		const submitted = this.toggle && this.pressed ? this.value : null;

		// The state restores an unpressed toggle too
		this.writeFormValue(submitted, String(this.pressed));
	}

	protected restoreState(state: string): void {
		if (this.toggle) this.pressed = state === 'true';
	}

	// Not `click`, which lands a tap late by the finger's dwell
	#bindMomentary(key: HTMLButtonElement, signal: AbortSignal): void {
		key.addEventListener(
			'pointerdown',
			(event) => {
				if (event.button !== 0 || !this.#isMomentary()) return;

				key.setPointerCapture(event.pointerId);
				this.#hold(event.pointerId);
			},
			{ signal },
		);
		bindHoldRelease(
			key,
			{
				holder: () => this.#holder,
				release: () => {
					this.#release();
				},
			},
			signal,
		);
		key.addEventListener(
			'keydown',
			(event) => {
				if (event.repeat || !holdKeys.has(event.key) || !this.#isMomentary()) return;

				this.#hold(event.key);
			},
			{ signal },
		);
		// Keyboard holds only; a finger on the next pad takes focus while this one is still held
		key.addEventListener(
			'blur',
			() => {
				if (typeof this.#holder === 'string') this.#release();
			},
			{ signal },
		);
	}

	#hold(holder: number | string): void {
		if (this.isDisabled() || this.#isSoftDisabled() || this.#holder !== undefined) return;

		this.#holder = holder;
		this.pressed = true;
		this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#isMomentary(): boolean {
		return this.momentary && !this.toggle;
	}

	#isSoftDisabled(): boolean {
		return this.softDisabled && !this.isDisabled();
	}

	#release(): void {
		if (this.#holder === undefined) return;

		this.#holder = undefined;
		this.pressed = false;
		this.dispatchEvent(new Event('change', { bubbles: true }));
	}
}
