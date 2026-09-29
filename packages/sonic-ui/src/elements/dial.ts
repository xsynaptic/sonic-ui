import { SonicRangeElement } from '#elements/range-element.ts';
import { readPxProperty } from '#lib/read-px-property.ts';
import { template } from '#lib/render.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-dial': SonicDial;
	}
}

const renderDial = template(
	/* HTML */ `
		<div class="sonic-dial" role="slider" tabindex="0">
			<div class="sonic-dial-notches"></div>
			<div class="sonic-dial-ring"></div>
			<div class="sonic-dial-modulation"></div>
			<div class="sonic-dial-cap"></div>
			<div class="sonic-dial-pointer"></div>
			<div class="sonic-dial-readout" popover="manual">
				<span></span>
				<input
					autocomplete="off"
					class="sonic-dial-entry"
					enterkeyhint="done"
					hidden
					spellcheck="false"
					type="text"
				/>
			</div>
		</div>
	`,
	HTMLDivElement,
);

const fallbackTravelPx = 160;

export class SonicDial extends SonicRangeElement {
	static override readonly observedAttributes = [
		...SonicRangeElement.observedAttributes,
		'modulation',
	];

	get modulation(): number {
		return this.numberAttribute('modulation', 0);
	}

	set modulation(amount: number | undefined) {
		this.reflect('modulation', amount);
	}

	readonly #dial = renderDial();

	override connectedCallback(): void {
		this.upgradeProperties('modulation');
		super.connectedCallback();
	}

	protected connect(signal: AbortSignal): void {
		const dial = this.#dial;

		this.appendOnce(dial);
		this.render();
		this.checkStyles(dial, 'dial.css');
		this.bindGestures(dial, signal, () => ({
			position: (event) => -event.clientY,
			// Once per gesture; a computed style read per move forces a style recalc
			travelPx: readPxProperty(getComputedStyle(dial), '--_sonic-dial-travel', fallbackTravelPx),
		}));
	}

	protected override focusTarget(): HTMLElement {
		return this.#dial;
	}

	protected render(): void {
		const dial = this.#dial;
		const positions = this.positions();
		const modulated = this.fraction(this.value + this.modulation);
		const value = this.fraction(this.value);

		dial.style.setProperty('--_sonic-dial-value', String(value));
		dial.style.setProperty('--_sonic-dial-origin', String(this.originFraction()));
		dial.style.setProperty('--_sonic-dial-modulation-from', String(Math.min(value, modulated)));
		dial.style.setProperty('--_sonic-dial-modulation-to', String(Math.max(value, modulated)));
		if (positions === undefined) dial.style.removeProperty('--_sonic-dial-positions');
		else dial.style.setProperty('--_sonic-dial-positions', String(positions));
		this.renderAria(dial);
	}
}
