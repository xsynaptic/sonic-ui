import type { Hold } from '#lib/hold.ts';

import { SonicFormElement } from '#elements/form-element.ts';
import { copyNode } from '#lib/copy-node.ts';
import { bindHold } from '#lib/hold.ts';
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

	get armed(): boolean {
		return this.hasAttribute('armed');
	}

	set armed(isArmed: boolean) {
		this.reflect('armed', isArmed);
	}

	get busy(): boolean {
		return this.hasAttribute('busy');
	}

	set busy(isBusy: boolean) {
		this.reflect('busy', isBusy);
	}

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

	get value(): string {
		return this.getAttribute('value') ?? 'on';
	}

	set value(value: string | undefined) {
		this.reflect('value', value);
	}

	#holding: Hold | undefined;

	#isDirty = false;

	readonly #key = renderKey();

	#pressed = false;

	attributeChangedCallback(name: string): void {
		if (name === 'pressed') this.#isDirty = false;
		if (this.isDisabled() || this.#isSoftDisabled()) this.#holding?.release();
		this.render();
	}

	override formResetCallback(): void {
		this.attributeChangedCallback('pressed');
	}

	protected override activate(): void {
		this.#key.click();
	}

	protected connect(signal: AbortSignal): void {
		const key = this.#key;
		const cap = requireChild(key, '.sonic-key-cap', HTMLSpanElement);

		this.upgradeProperties(
			'armed',
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

		this.writeFormValue(submitted, String(this.pressed));
	}

	protected restoreState(state: string): void {
		if (this.toggle) this.pressed = state === 'true';
	}

	#bindMomentary(key: HTMLButtonElement, signal: AbortSignal): void {
		const holding = bindHold(
			key,
			{
				canHold: () => !this.isDisabled() && !this.#isSoftDisabled(),
				leave: 'blur',
				onHold: () => {
					this.#press(true);
				},
				onRelease: () => {
					this.#press(false);
				},
			},
			signal,
		);

		this.#holding = holding;
		key.addEventListener(
			'pointerdown',
			(event) => {
				if (event.button !== 0 || !this.#isMomentary()) return;

				key.setPointerCapture(event.pointerId);
				holding.hold(event.pointerId);
			},
			{ signal },
		);
		key.addEventListener(
			'keydown',
			(event) => {
				if (event.repeat || !holdKeys.has(event.key) || !this.#isMomentary()) return;

				holding.hold(event.key);
			},
			{ signal },
		);
	}

	#isMomentary(): boolean {
		return this.momentary && !this.toggle;
	}

	#isSoftDisabled(): boolean {
		return this.softDisabled && !this.isDisabled();
	}

	#press(isPressed: boolean): void {
		this.pressed = isPressed;
		this.dispatchEvent(new Event('change', { bubbles: true }));
	}
}
