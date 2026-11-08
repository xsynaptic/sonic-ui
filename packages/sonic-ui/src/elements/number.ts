import { SonicValueElement } from '#elements/value-element.ts';
import { requireChild, template } from '#lib/render.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-number': SonicNumber;
	}
}

const renderNumber = template(
	/* HTML */ `
		<div class="sonic-number" role="spinbutton" tabindex="0">
			<span aria-hidden="true" class="sonic-number-decrement"></span>
			<span aria-hidden="true" class="sonic-number-value"></span>
			<input
				autocomplete="off"
				class="sonic-number-entry"
				enterkeyhint="done"
				hidden
				spellcheck="false"
				type="text"
			/>
			<span aria-hidden="true" class="sonic-number-increment"></span>
		</div>
	`,
	HTMLDivElement,
);

export class SonicNumber extends SonicValueElement {
	get arrows(): boolean {
		return this.hasAttribute('arrows');
	}

	set arrows(isShown: boolean) {
		this.reflect('arrows', isShown);
	}

	get press(): 'none' | 'step' {
		return this.getAttribute('press') === 'step' ? 'step' : 'none';
	}

	set press(gesture: 'none' | 'step' | undefined) {
		this.reflect('press', gesture);
	}

	protected override readonly control = renderNumber();

	protected override readonly sheet = 'number.css';

	readonly #decrement = requireChild(this.control, '.sonic-number-decrement', HTMLSpanElement);

	readonly #digits = requireChild(this.control, '.sonic-number-value', HTMLSpanElement);

	readonly #increment = requireChild(this.control, '.sonic-number-increment', HTMLSpanElement);

	override connectedCallback(): void {
		this.upgradeProperties('arrows', 'press');
		super.connectedCallback();
	}

	protected connect(signal: AbortSignal): void {
		this.keepControl(signal);
		this.render();
		this.bindGestures(signal, () => this.upwardAxis('--_sonic-number-travel'));
		this.bindArrow(this.#decrement, 'ArrowDown', signal);
		this.bindArrow(this.#increment, 'ArrowUp', signal);
	}

	protected override controlRole(): 'spinbutton' {
		return 'spinbutton';
	}

	protected draw(): void {
		this.#digits.textContent = this.valueText;
	}

	protected override tapTarget(): number | undefined {
		if (this.press !== 'step') return undefined;

		const mapping = this.mapping();
		const next = mapping.keyTarget('ArrowUp', this.value);

		return next === undefined || next === this.value ? mapping.bounds[0] : next;
	}
}
