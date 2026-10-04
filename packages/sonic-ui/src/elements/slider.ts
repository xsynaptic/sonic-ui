import type { ValueAxis } from '#elements/value-element.ts';

import { SonicValueElement } from '#elements/value-element.ts';
import { requireChild, template } from '#lib/render.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-slider': SonicSlider;
	}
}

interface SliderAxis extends ValueAxis {
	startPx: number;
}

function grooveStop(proportion: number): string {
	if (proportion <= 0) return '0%';
	if (proportion >= 1) return '100%';

	return `calc(${String(proportion)} * var(--_sonic-slider-travel) + var(--_sonic-slider-groove) / 2)`;
}

const renderSlider = template(
	/* HTML */ `
		<div class="sonic-slider" role="slider" tabindex="0">
			<div class="sonic-slider-scale" aria-hidden="true"></div>
			<div class="sonic-slider-notches"></div>
			<div class="sonic-slider-groove"></div>
			<div class="sonic-slider-modulation"></div>
			<div class="sonic-slider-cap"></div>
			<div class="sonic-slider-readout" popover="manual">
				<span></span>
				<input
					autocomplete="off"
					class="sonic-slider-entry"
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

export class SonicSlider extends SonicValueElement {
	static override readonly observedAttributes = [
		...SonicValueElement.observedAttributes,
		'modulation',
		'orientation',
		'spring',
	];

	get groovePress(): 'jump' | 'none' {
		return this.getAttribute('groove-press') === 'none' ? 'none' : 'jump';
	}

	set groovePress(gesture: 'jump' | 'none' | undefined) {
		this.reflect('groove-press', gesture);
	}

	get modulation(): number {
		return this.numberAttribute('modulation', 0);
	}

	set modulation(amount: number | undefined) {
		this.reflect('modulation', amount);
	}

	get modulationValue(): number | undefined {
		return this.readModulationValue();
	}

	set modulationValue(value: null | number | undefined) {
		this.writeModulationValue(this.#slider, 'slider', value);
	}

	get orientation(): 'horizontal' | 'vertical' {
		return this.getAttribute('orientation') === 'vertical' ? 'vertical' : 'horizontal';
	}

	set orientation(direction: 'horizontal' | 'vertical' | undefined) {
		this.reflect('orientation', direction);
	}

	get spring(): boolean {
		return this.hasAttribute('spring');
	}

	set spring(isSpring: boolean) {
		this.reflect('spring', isSpring);
	}

	readonly #slider = renderSlider();

	override connectedCallback(): void {
		this.upgradeProperties('groovePress', 'modulationValue', 'modulation', 'orientation', 'spring');
		super.connectedCallback();
	}

	protected connect(signal: AbortSignal): void {
		const slider = this.#slider;
		const cap = requireChild(slider, '.sonic-slider-cap', HTMLDivElement);

		this.bindScale(slider, requireChild(slider, '.sonic-slider-scale', HTMLDivElement), signal);
		slider.addEventListener(
			'transitionend',
			(event) => {
				if (event.propertyName === '--_sonic-slider-value') this.toggleState('springing', false);
			},
			{ signal },
		);
		this.render();
		this.checkStyles(slider, 'slider.css');
		this.bindGestures(slider, signal, (event) => {
			const axis = this.#axis(slider, cap);
			if (event.target instanceof Node && cap.contains(event.target)) return axis;

			if (this.groovePress === 'none') return;

			this.input(this.mapping().valueAt((axis.position(event) - axis.startPx) / axis.travelPx));

			return axis;
		});
	}

	protected override controlOrientation(): 'horizontal' | 'vertical' {
		return this.orientation;
	}

	protected draw(): void {
		this.writeProportions(this.#slider, 'slider', this.modulation);
		this.#renderBuffered(this.#slider);
	}

	protected override focusTarget(): HTMLElement {
		return this.#slider;
	}

	protected override springTarget(): number | undefined {
		return this.spring ? this.originValue() : undefined;
	}

	#axis(slider: HTMLElement, cap: HTMLElement): SliderAxis {
		const box = slider.getBoundingClientRect();
		const capBox = cap.getBoundingClientRect();

		return this.orientation === 'vertical'
			? {
					position: (event) => -event.clientY,
					startPx: capBox.height / 2 - box.bottom,
					travelPx: Math.max(1, box.height - capBox.height),
				}
			: {
					position: (event) => event.clientX,
					startPx: box.left + capBox.width / 2,
					travelPx: Math.max(1, box.width - capBox.width),
				};
	}

	#renderBuffered(slider: HTMLElement): void {
		const buffered = this.buffered;

		if (buffered.length === 0) {
			slider.style.removeProperty('--_sonic-slider-buffered-regions');
			return;
		}

		const { proportionOf } = this.mapping();
		const stops = buffered.flatMap(([start, end]) => {
			const from = grooveStop(proportionOf(Math.min(start, end)));
			const to = grooveStop(proportionOf(Math.max(start, end)));

			return [
				`transparent ${from}`,
				`var(--_sonic-slider-buffered) ${from} ${to}`,
				`transparent ${to}`,
			];
		});

		slider.style.setProperty(
			'--_sonic-slider-buffered-regions',
			`linear-gradient(var(--_sonic-slider-toward), ${stops.join(', ')})`,
		);
	}
}
