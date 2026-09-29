import { SonicRangeElement } from '#elements/range-element.ts';
import { readPxProperty } from '#lib/read-px-property.ts';
import { requireChild, template } from '#lib/render.ts';

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

const fallbackTravelPx = 160;

export class SonicNumber extends SonicRangeElement {
	readonly #number = renderNumber();

	readonly #digits = requireChild(this.#number, '.sonic-number-value', HTMLSpanElement);

	protected connect(signal: AbortSignal): void {
		const number = this.#number;

		this.appendOnce(number);
		this.render();
		this.checkStyles(number, 'number.css');
		this.bindGestures(number, signal, () => ({
			position: (event) => -event.clientY,
			travelPx: readPxProperty(
				getComputedStyle(number),
				'--_sonic-number-travel',
				fallbackTravelPx,
			),
		}));
	}

	protected override controlRole(): 'spinbutton' {
		return 'spinbutton';
	}

	protected override focusTarget(): HTMLElement {
		return this.#number;
	}

	protected render(): void {
		this.#digits.textContent = this.valueText();
		this.renderAria(this.#number);
	}
}
