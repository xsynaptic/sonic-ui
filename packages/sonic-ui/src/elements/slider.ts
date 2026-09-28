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

const renderSlider = template(
	/* HTML */ `
		<div class="sonic-slider" role="slider" tabindex="0">
			<div class="sonic-slider-marks"></div>
			<div class="sonic-slider-groove"></div>
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
		'orientation',
	];

	readonly #slider = renderSlider();

	protected connect(signal: AbortSignal): void {
		const slider = this.#slider;
		const cap = requireChild(slider, '.sonic-slider-cap', HTMLDivElement);

		this.appendOnce(slider);
		this.render();
		this.checkStyles(slider, 'slider.css');
		this.bindGestures(slider, signal, (event) => {
			const axis = this.#axis(slider, cap);
			if (event.target instanceof Node && cap.contains(event.target)) return axis;

			if (this.getAttribute('groove-press') === 'none') return;

			this.input(this.valueAt((axis.position(event) - axis.startPx) / axis.travelPx));

			return axis;
		});
	}

	protected render(): void {
		const slider = this.#slider;
		const positions = this.positions();

		slider.style.setProperty('--_sonic-slider-value', String(this.fraction(this.value)));
		slider.style.setProperty('--_sonic-slider-origin', String(this.originFraction()));
		if (positions === undefined) slider.style.removeProperty('--_sonic-slider-positions');
		else slider.style.setProperty('--_sonic-slider-positions', String(positions));
		this.renderAria(slider, this.#isVertical() ? 'vertical' : 'horizontal');
	}

	#axis(slider: HTMLElement, cap: HTMLElement): SliderAxis {
		const track = slider.getBoundingClientRect();
		const capBox = cap.getBoundingClientRect();

		if (this.#isVertical()) {
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

	#isVertical(): boolean {
		return this.getAttribute('orientation') === 'vertical';
	}
}
