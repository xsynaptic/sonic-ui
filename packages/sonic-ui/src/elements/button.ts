import type { Hold } from '#lib/hold.ts';

import { SonicFormElement } from '#elements/form-element.ts';
import { copyNode } from '#lib/copy-node.ts';
import { bindHold } from '#lib/hold.ts';
import { bindKeyPress } from '#lib/key-press.ts';
import { mirrorChildren } from '#lib/mirror-children.ts';
import { capturePointer } from '#lib/pointer-drag.ts';
import { placeChildren, requireChild, template } from '#lib/render.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

declare const __DEV__: boolean;

declare global {
	interface HTMLElementTagNameMap {
		'sonic-button': SonicButton;
	}
}

const renderButton = template(
	/* HTML */ `
		<button class="sonic-button" type="button"><span class="sonic-button-cap"></span></button>
	`,
	HTMLButtonElement,
);

const holdKeys = new Set([' ', 'Enter']);

const popupAttributes = {
	controls: 'aria-controls',
	expanded: 'aria-expanded',
	popup: 'aria-haspopup',
} as const;

const pressWhens = new Set(['pressed', 'released']);

export class SonicButton extends SonicFormElement {
	static override readonly observedAttributes = [
		...SonicFormElement.observedAttributes,
		...Object.keys(popupAttributes),
		'busy',
		'legend',
		'momentary',
		'pressed',
		'soft-disabled',
		'latching',
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

	get latching(): boolean {
		return this.hasAttribute('latching');
	}

	set latching(isLatching: boolean) {
		this.reflect('latching', isLatching);
	}

	/** Shows the legend child whose `data-sonic-when` has this name */
	get legend(): string | undefined {
		return this.getAttribute('legend') ?? undefined;
	}

	set legend(name: string | undefined) {
		this.reflect('legend', name);
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

	/** Submitted with the form while a latching button is pressed */
	get value(): string {
		return this.getAttribute('value') ?? 'on';
	}

	set value(value: string | undefined) {
		this.reflect('value', value);
	}

	readonly #button = renderButton();

	#holding: Hold | undefined;

	#isDirty = false;

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
		this.#button.click();
	}

	protected connect(signal: AbortSignal): void {
		const button = this.#button;
		const cap = requireChild(button, '.sonic-button-cap', HTMLSpanElement);

		this.upgradeProperties(
			'armed',
			'busy',
			'defaultPressed',
			'legend',
			'momentary',
			'softDisabled',
			'latching',
			'pressed',
			'value',
		);
		mirrorChildren(
			this,
			{
				control: button,
				copy: copyNode,
				place: (copies) => {
					placeChildren(cap, copies);
					this.#showLegend();
				},
			},
			signal,
		);
		this.render();
		if (__DEV__)
			this.checkStyles(button, 'button.css', {
				property: 'padding-inline-start',
				ratio: '--_sonic-button-padding-ratio',
				selector: '.sonic-button-cap > :not(svg, .sonic-led)',
			});

		button.addEventListener(
			'click',
			(event) => {
				// A native disabled button fires no click at all
				if (this.#isSoftDisabled()) {
					event.preventDefault();
					event.stopImmediatePropagation();
					return;
				}
				if (!this.latching) return;

				this.pressed = !this.pressed;
				this.dispatchEvent(new Event('change', { bubbles: true }));
			},
			{ signal },
		);
		this.#bindMomentary(button, signal);
		bindKeyPress(button, signal);
	}

	protected override focusTarget(): HTMLElement {
		return this.#button;
	}

	protected render(): void {
		if (!this.isBound()) return;

		const button = this.#button;

		writeAttribute(button, 'disabled', this.isDisabled() ? '' : undefined);
		writeAttribute(button, 'aria-disabled', this.#isSoftDisabled() ? 'true' : undefined);
		writeAttribute(button, 'aria-busy', this.busy ? 'true' : undefined);
		writeAttribute(button, 'aria-pressed', this.latching ? String(this.pressed) : undefined);
		this.toggleState('pressed', this.pressed);
		this.forwardNaming(button, true);
		this.#forwardPopup(button);
		this.#showLegend();

		// eslint-disable-next-line unicorn/no-null -- `null` submits nothing
		const submitted = this.latching && this.pressed ? this.value : null;

		this.writeFormValue(submitted, String(this.pressed));
	}

	protected restoreState(state: string): void {
		if (this.latching) this.pressed = state === 'true';
	}

	#bindMomentary(button: HTMLButtonElement, signal: AbortSignal): void {
		const holding = bindHold(
			button,
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
		button.addEventListener(
			'pointerdown',
			(event) => {
				if (event.button !== 0 || !this.#isMomentary()) return;

				capturePointer(button, event.pointerId);
				holding.hold(event.pointerId);
			},
			{ signal },
		);
		button.addEventListener(
			'keydown',
			(event) => {
				if (event.repeat || event.defaultPrevented) return;
				if (!holdKeys.has(event.key) || !this.#isMomentary()) return;

				holding.hold(event.key);
			},
			{ signal },
		);
	}

	#forwardPopup(button: HTMLButtonElement): void {
		for (const [name, aria] of Object.entries(popupAttributes)) {
			writeAttribute(button, aria, this.getAttribute(name) ?? undefined);
		}
	}

	#isMomentary(): boolean {
		return this.momentary && !this.latching;
	}

	#isSoftDisabled(): boolean {
		return this.softDisabled && !this.isDisabled();
	}

	#press(isPressed: boolean): void {
		this.pressed = isPressed;
		this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#showLegend(): void {
		const legend = this.legend;

		for (const part of this.#button.querySelectorAll<HTMLElement | SVGElement>(
			':scope > .sonic-button-cap > [data-sonic-when]',
		)) {
			const when = part.dataset.sonicWhen ?? '';

			part.toggleAttribute('data-sonic-hidden', !pressWhens.has(when) && when !== legend);
		}
	}
}
