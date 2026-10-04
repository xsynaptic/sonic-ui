import { SonicValueElement } from '#elements/value-element.ts';
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
			<div class="sonic-dial-indicator"></div>
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

export class SonicDial extends SonicValueElement {
	static override readonly observedAttributes = [
		...SonicValueElement.observedAttributes,
		'endless',
		'modulation',
	];

	get endless(): boolean {
		return this.hasAttribute('endless');
	}

	set endless(isEndless: boolean) {
		this.reflect('endless', isEndless);
	}

	// fallow-ignore-next-line code-duplication -- one accessor pair per reflected attribute
	get modulation(): number {
		return this.numberAttribute('modulation', 0);
	}

	set modulation(amount: number | undefined) {
		this.reflect('modulation', amount);
	}

	// fallow-ignore-next-line code-duplication -- one accessor pair per property
	get modulationValue(): number | undefined {
		return this.readModulationValue();
	}

	set modulationValue(value: null | number | undefined) {
		this.writeModulationValue(this.#dial, 'dial', value);
	}

	readonly #dial = renderDial();

	override connectedCallback(): void {
		this.upgradeProperties('endless', 'modulationValue', 'modulation');
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
		this.writeProportions(this.#dial, 'dial', this.endless ? 0 : this.modulation);
	}

	protected override focusTarget(): HTMLElement {
		return this.#dial;
	}

	protected override isWrapping(): boolean {
		return this.endless;
	}
}
