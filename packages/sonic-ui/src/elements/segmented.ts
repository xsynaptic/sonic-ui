import { SonicRadioGroupElement } from '#elements/radio-group.ts';
import { template } from '#lib/render.ts';

declare const __DEV__: boolean;

declare global {
	interface HTMLElementTagNameMap {
		'sonic-segmented': SonicSegmented;
	}
}

const renderSegmented = template(
	/* HTML */ `<div class="sonic-segmented" role="radiogroup"></div>`,
	HTMLDivElement,
);

const renderOption = template(
	/* HTML */ `
		<button class="sonic-segmented-option" role="radio" type="button">
			<span class="sonic-segmented-cap"></span>
		</button>
	`,
	HTMLButtonElement,
);

export class SonicSegmented extends SonicRadioGroupElement {
	protected readonly group = renderSegmented();

	protected override connect(signal: AbortSignal): void {
		super.connect(signal);
		if (__DEV__)
			this.checkStyles(this.group, 'segmented.css', {
				box: {
					property: 'padding-inline-start',
					ratio: '--_sonic-segmented-padding-ratio',
					selector: '.sonic-segmented-cap',
				},
				material: ['well', 'keycap', ['cap', '.sonic-segmented-option']],
			});
	}

	protected renderOption(): HTMLButtonElement {
		return renderOption();
	}
}
