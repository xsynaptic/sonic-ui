import { SonicRangeElement } from '#elements/range-element.ts';
import { requireChild, template } from '#lib/render.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-dial': SonicDial;
	}
}

const renderDial = template(
	/* HTML */ `
		<div class="sonic-dial" role="slider" tabindex="0">
			<div class="sonic-dial-scale" aria-hidden="true"></div>
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

export class SonicDial extends SonicRangeElement {
	static override readonly observedAttributes = [
		...SonicRangeElement.observedAttributes,
		'endless',
		'modulation',
	];

	get endless(): boolean {
		return this.hasAttribute('endless');
	}

	set endless(isEndless: boolean) {
		this.reflect('endless', isEndless);
	}

	// fallow-ignore-next-line code-duplication -- one accessor pair per property
	get modulated(): number | undefined {
		return this.modulatedValue();
	}

	set modulated(value: number | undefined) {
		this.writeModulated(this.#dial, 'dial', value);
	}

	// fallow-ignore-next-line code-duplication -- one accessor pair per reflected attribute
	get modulation(): number {
		return this.numberAttribute('modulation', 0);
	}

	set modulation(amount: number | undefined) {
		this.reflect('modulation', amount);
	}

	readonly #dial = renderDial();

	override connectedCallback(): void {
		this.upgradeProperties('endless', 'modulated', 'modulation');
		super.connectedCallback();
	}

	protected connect(signal: AbortSignal): void {
		const dial = this.#dial;

		this.bindScale(dial, requireChild(dial, '.sonic-dial-scale', HTMLDivElement), signal);
		this.render();
		this.checkStyles(dial, 'dial.css');
		this.bindGestures(dial, signal, () => ({
			position: (event) => -event.clientY,
			travelPx: this.travelPx(dial, '--_sonic-dial-travel'),
		}));
	}

	protected draw(): void {
		this.writePlaces(this.#dial, 'dial', this.endless ? 0 : this.modulation);
	}

	protected override focusTarget(): HTMLElement {
		return this.#dial;
	}

	protected override isWrapping(): boolean {
		return this.endless;
	}
}
