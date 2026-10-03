import type { RangeAxis } from '#elements/range-element.ts';

import { SonicRangeElement } from '#elements/range-element.ts';
import { requireChild, template } from '#lib/render.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-slider': SonicSlider;
	}
}

interface SliderAxis extends RangeAxis {
	startPx: number;
}

function grooveStop(place: number): string {
	if (place <= 0) return '0%';
	if (place >= 1) return '100%';

	return `calc(${String(place)} * var(--_sonic-slider-travel) + var(--_sonic-slider-groove) / 2)`;
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

export class SonicSlider extends SonicRangeElement {
	static override readonly observedAttributes = [
		...SonicRangeElement.observedAttributes,
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

	get modulated(): number | undefined {
		return this.modulatedValue();
	}

	set modulated(value: number | undefined) {
		this.writeModulated(this.#slider, 'slider', value);
	}

	get modulation(): number {
		return this.numberAttribute('modulation', 0);
	}

	set modulation(amount: number | undefined) {
		this.reflect('modulation', amount);
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
		this.upgradeProperties('groovePress', 'modulated', 'modulation', 'orientation', 'spring');
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

			this.input(this.scale().valueAt((axis.position(event) - axis.startPx) / axis.travelPx));

			return axis;
		});
	}

	protected override controlOrientation(): 'horizontal' | 'vertical' {
		return this.orientation;
	}

	protected draw(): void {
		this.writePlaces(this.#slider, 'slider', this.modulation);
		this.#renderBuffered(this.#slider);
	}

	protected override focusTarget(): HTMLElement {
		return this.#slider;
	}

	protected override springTarget(): number | undefined {
		return this.spring ? this.restValue() : undefined;
	}

	#axis(slider: HTMLElement, cap: HTMLElement): SliderAxis {
		const track = slider.getBoundingClientRect();
		const capBox = cap.getBoundingClientRect();

		return this.orientation === 'vertical'
			? {
					position: (event) => -event.clientY,
					startPx: capBox.height / 2 - track.bottom,
					travelPx: Math.max(1, track.height - capBox.height),
				}
			: {
					position: (event) => event.clientX,
					startPx: track.left + capBox.width / 2,
					travelPx: Math.max(1, track.width - capBox.width),
				};
	}

	#renderBuffered(slider: HTMLElement): void {
		const buffered = this.buffered;

		if (buffered.length === 0) {
			slider.style.removeProperty('--_sonic-slider-buffered-spans');
			return;
		}

		const { place } = this.scale();
		const stops = buffered.flatMap(([start, end]) => {
			const from = grooveStop(place(Math.min(start, end)));
			const to = grooveStop(place(Math.max(start, end)));

			return [
				`transparent ${from}`,
				`var(--_sonic-slider-buffered) ${from} ${to}`,
				`transparent ${to}`,
			];
		});

		slider.style.setProperty(
			'--_sonic-slider-buffered-spans',
			`linear-gradient(var(--_sonic-slider-toward), ${stops.join(', ')})`,
		);
	}
}
