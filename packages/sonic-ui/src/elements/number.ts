import { SonicValueElement } from '#elements/value-element.ts';
import { requireChild, template } from '#lib/render.ts';

declare const __DEV__: boolean;

declare global {
	interface HTMLElementTagNameMap {
		'sonic-number': SonicNumber;
	}
}

const renderNumber = template(
	/* HTML */ `
		<div class="sonic-number" role="spinbutton" tabindex="0">
			<span aria-hidden="true" class="sonic-number-value"></span>
			<input
				autocomplete="off"
				class="sonic-number-entry"
				enterkeyhint="done"
				hidden
				spellcheck="false"
				type="text"
			/>
		</div>
	`,
	HTMLDivElement,
);

export class SonicNumber extends SonicValueElement {
	get press(): 'none' | 'step' {
		return this.getAttribute('press') === 'step' ? 'step' : 'none';
	}

	set press(gesture: 'none' | 'step' | undefined) {
		this.reflect('press', gesture);
	}

	readonly #number = renderNumber();

	readonly #digits = requireChild(this.#number, '.sonic-number-value', HTMLSpanElement);

	override connectedCallback(): void {
		this.upgradeProperties('press');
		super.connectedCallback();
	}

	protected connect(signal: AbortSignal): void {
		const number = this.#number;

		this.keepControl(number, signal);
		this.render();
		if (__DEV__) this.checkStyles(number, 'number.css');
		this.bindGestures(number, signal, () => ({
			position: (event) => -event.clientY,
			travelPx: this.travelPx(number, '--_sonic-number-travel'),
		}));
	}

	protected override controlRole(): 'spinbutton' {
		return 'spinbutton';
	}

	protected draw(): void {
		this.#digits.textContent = this.valueText;
	}

	protected override focusTarget(): HTMLElement {
		return this.#number;
	}

	protected override tapTarget(): number | undefined {
		if (this.press !== 'step') return undefined;

		const mapping = this.mapping();
		const next = mapping.keyTarget('ArrowUp', this.value);

		return next === undefined || next === this.value ? mapping.bounds[0] : next;
	}
}
