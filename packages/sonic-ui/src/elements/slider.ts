import type { RangeAxis } from '#elements/range-element.ts';

import { SonicRangeElement } from '#elements/range-element.ts';
import { requireChild, template } from '#lib/render.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-slider': SonicSlider;
	}
}

interface SliderAxis extends RangeAxis {
	// The cap's centre at the minimum, on the same scale as `position`
	startPx: number;
}

export type BufferedRanges = Iterable<readonly [number, number]> | TimeRanges;

function readRanges(ranges: BufferedRanges): Array<[number, number]> {
	if ('start' in ranges) {
		return Array.from({ length: ranges.length }, (_entry, index) => [
			ranges.start(index),
			ranges.end(index),
		]);
	}

	return [...ranges].map(([start, end]) => [start, end]);
}

// Along the groove, which runs past the travel by half its width at each end
function grooveStop(fraction: number): string {
	if (fraction <= 0) return '0%';
	if (fraction >= 1) return '100%';

	return `calc(${String(fraction)} * var(--_sonic-slider-travel) + var(--_sonic-slider-groove) / 2)`;
}

const renderSlider = template(
	/* HTML */ `
		<div class="sonic-slider" role="slider" tabindex="0">
			<div class="sonic-slider-scale" aria-hidden="true"></div>
			<div class="sonic-slider-marks"></div>
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

	get buffered(): Array<[number, number]> {
		return this.#buffered.map(([start, end]) => [start, end]);
	}

	set buffered(ranges: BufferedRanges | undefined) {
		this.#buffered = ranges
			? readRanges(ranges).toSorted((first, second) => first[0] - second[0])
			: [];
		this.render();
	}

	// Named for the absent attribute, as `input.type` reads `text`
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

	#buffered: Array<[number, number]> = [];

	readonly #slider = renderSlider();

	override connectedCallback(): void {
		this.upgradeProperties('buffered', 'groovePress', 'modulation', 'orientation', 'spring');
		super.connectedCallback();
	}

	protected connect(signal: AbortSignal): void {
		const slider = this.#slider;
		const cap = requireChild(slider, '.sonic-slider-cap', HTMLDivElement);

		this.bindScale(slider, requireChild(slider, '.sonic-slider-scale', HTMLDivElement), signal);
		// Cleared when the glide lands, or a later scripted value would glide too
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

			this.input(this.valueAt((axis.position(event) - axis.startPx) / axis.travelPx));

			return axis;
		});
	}

	protected override focusTarget(): HTMLElement {
		return this.#slider;
	}

	protected render(): void {
		const slider = this.#slider;
		const positions = this.positions();
		const [modulationFrom, modulationTo] = this.modulationFractions(this.modulation);

		slider.style.setProperty('--_sonic-slider-value', String(this.fraction(this.value)));
		slider.style.setProperty('--_sonic-slider-origin', String(this.originFraction()));
		slider.style.setProperty('--_sonic-slider-modulation-from', String(modulationFrom));
		slider.style.setProperty('--_sonic-slider-modulation-to', String(modulationTo));
		if (positions === undefined) slider.style.removeProperty('--_sonic-slider-positions');
		else slider.style.setProperty('--_sonic-slider-positions', String(positions));
		this.#renderBuffered(slider);
		this.renderScale();
		this.renderAria(slider, this.orientation);
	}

	protected override springTarget(): number | undefined {
		return this.spring ? this.restValue() : undefined;
	}

	#axis(slider: HTMLElement, cap: HTMLElement): SliderAxis {
		const track = slider.getBoundingClientRect();
		const capBox = cap.getBoundingClientRect();

		if (this.orientation === 'vertical') {
			return {
				position: (event) => -event.clientY,
				startPx: capBox.height / 2 - track.bottom,
				travelPx: Math.max(1, track.height - capBox.height),
			};
		}

		return {
			position: (event) => event.clientX,
			startPx: track.left + capBox.width / 2,
			travelPx: Math.max(1, track.width - capBox.width),
		};
	}

	// Hard stops in one gradient, so any number of ranges costs one layer
	#renderBuffered(slider: HTMLElement): void {
		if (this.#buffered.length === 0) {
			slider.style.removeProperty('--_sonic-slider-buffered-ranges');
			return;
		}

		const stops = this.#buffered.flatMap(([start, end]) => {
			const from = grooveStop(this.fraction(Math.min(start, end)));
			const to = grooveStop(this.fraction(Math.max(start, end)));

			return [
				`transparent ${from}`,
				`var(--_sonic-slider-buffered) ${from} ${to}`,
				`transparent ${to}`,
			];
		});

		slider.style.setProperty(
			'--_sonic-slider-buffered-ranges',
			`linear-gradient(var(--_sonic-slider-toward), ${stops.join(', ')})`,
		);
	}
}
