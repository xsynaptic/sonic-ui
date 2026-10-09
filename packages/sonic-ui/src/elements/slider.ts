import type { ValueAxis } from '#elements/value-gestures.ts';
import type { TimeRegions } from '#lib/time-regions.ts';

import { createModulation } from '#elements/modulation.ts';
import { bindScale } from '#elements/scale.ts';
import { SonicValueElement } from '#elements/value-element.ts';
import { clampProportion } from '#lib/math.ts';
import { requireChild, template } from '#lib/render.ts';
import { scrubRegions } from '#lib/scrub.ts';
import { sortedRegions } from '#lib/time-regions.ts';

declare const __DEV__: boolean;

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

	return `calc(${String(proportion)} * var(--_sonic-slider-travel) + var(--_sonic-slider-groove-end))`;
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
		'scrub',
		'spring',
	];

	/** Loaded spans, in the slider's own values */
	// fallow-ignore-next-line code-duplication -- one accessor pair per property
	get buffered(): Array<[number, number]> {
		return this.#buffered.map(([start, end]) => [start, end]);
	}

	set buffered(regions: TimeRegions | undefined) {
		this.#buffered = sortedRegions(regions);
		this.render();
	}

	get groovePress(): 'jump' | 'none' {
		return this.getAttribute('groove-press') === 'none' ? 'none' : 'jump';
	}

	set groovePress(gesture: 'jump' | 'none' | undefined) {
		this.reflect('groove-press', gesture);
	}

	/** How far a modulation source can push the value, in value units; signed */
	get modulation(): number {
		return this.numberAttribute('modulation', 0);
	}

	set modulation(amount: number | undefined) {
		this.reflect('modulation', amount);
	}

	/** Where the value is right now with modulation applied; a property only, cheap to write every frame, fires nothing */
	get modulationValue(): number | undefined {
		return this.#modulation.value();
	}

	set modulationValue(value: null | number | undefined) {
		this.#modulation.write(value, this.isBound() ? this.mapping() : undefined);
	}

	get orientation(): 'horizontal' | 'vertical' {
		return this.getAttribute('orientation') === 'vertical' ? 'vertical' : 'horizontal';
	}

	set orientation(direction: 'horizontal' | 'vertical' | undefined) {
		this.reflect('orientation', direction);
	}

	get scrub(): boolean {
		return this.hasAttribute('scrub');
	}

	set scrub(isScrubbing: boolean) {
		this.reflect('scrub', isScrubbing);
	}

	get spring(): boolean {
		return this.hasAttribute('spring');
	}

	set spring(isSpring: boolean) {
		this.reflect('spring', isSpring);
	}

	#buffered: Array<[number, number]> = [];

	readonly #slider = renderSlider();

	readonly #modulation = createModulation(this.#slider, 'slider', (isModulated) => {
		this.toggleState('modulated', isModulated);
	});

	override connectedCallback(): void {
		this.upgradeProperties(
			'buffered',
			'groovePress',
			'modulationValue',
			'modulation',
			'orientation',
			'scrub',
			'spring',
		);
		super.connectedCallback();
	}

	protected connect(signal: AbortSignal): void {
		const slider = this.#slider;
		const cap = requireChild(slider, '.sonic-slider-cap', HTMLDivElement);

		bindScale(
			this,
			{ control: slider, marks: requireChild(slider, '.sonic-slider-scale', HTMLDivElement) },
			signal,
		);
		slider.addEventListener(
			'transitionend',
			(event) => {
				if (event.propertyName === '--_sonic-slider-value') this.toggleState('springing', false);
			},
			{ signal },
		);
		this.bindHover(slider, signal, {
			canShow: () => this.scrub && this.orientation === 'horizontal',
			place: () => {
				this.#placeReadout(slider);
			},
			valueAt: (event) => {
				const axis = this.#axis(slider, cap);
				const at = clampProportion((axis.position(event) - axis.startPx) / axis.travelPx);
				const mapping = this.mapping();

				return mapping.snap(mapping.valueAt(at));
			},
		});
		this.render();
		if (__DEV__)
			this.checkStyles(slider, 'slider.css', { property: 'margin-bottom', selector: '[popover]' });
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
		this.#modulation.draw({
			mapping: this.mapping(),
			modulation: this.modulation,
			origin: this.originValue(),
			value: this.value,
		});
		this.#renderBuffered(this.#slider);
		this.#renderScrub(this.#slider);
		this.#placeReadout(this.#slider);
	}

	protected override focusTarget(): HTMLElement {
		return this.#slider;
	}

	protected override scrubChanged(): void {
		if (this.scrub) this.render();
	}

	protected override scrubsKeyRepeat(): boolean {
		return this.scrub;
	}

	protected override springTarget(): number | undefined {
		return this.spring ? this.originValue() : undefined;
	}

	protected override stateTarget(): HTMLElement {
		return this.#slider;
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

	#placeReadout(slider: HTMLElement): void {
		if (!this.scrub) {
			slider.style.removeProperty('--_sonic-slider-readout-value');
			return;
		}

		slider.style.setProperty(
			'--_sonic-slider-readout-value',
			String(this.mapping().proportionOf(this.readoutValue())),
		);
	}

	#renderBuffered(slider: HTMLElement): void {
		const buffered = this.#buffered;

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

	#renderScrub(slider: HTMLElement): void {
		const { style } = slider;
		const state = this.scrubState();
		const { played, scrub } = scrubRegions(state, this.value, this.mapping());

		if (this.scrub && state.from !== undefined) {
			style.setProperty('--_sonic-slider-played', String(played));
		} else style.removeProperty('--_sonic-slider-played');

		if (scrub === undefined || !this.scrub) {
			style.removeProperty('--_sonic-slider-scrub-region');
			return;
		}

		const from = grooveStop(Math.min(played, scrub));
		const to = grooveStop(Math.max(played, scrub));

		style.setProperty(
			'--_sonic-slider-scrub-region',
			`linear-gradient(var(--_sonic-slider-toward), transparent ${from}, var(--_sonic-slider-scrub) ${from} ${to}, transparent ${to})`,
		);
	}
}
