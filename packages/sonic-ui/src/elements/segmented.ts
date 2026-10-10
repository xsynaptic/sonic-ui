import type { BoxProbe } from '#lib/check-styles.ts';

import { SonicRadioGroupElement } from '#elements/radio-group.ts';
import { template } from '#lib/render.ts';

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
	protected override readonly boxProbe: BoxProbe = {
		property: 'padding-inline-start',
		ratio: '--_sonic-segmented-padding-ratio',
		selector: '.sonic-segmented-cap',
	};

	protected override readonly control = renderSegmented();

	protected override readonly sheet = 'segmented.css';

	protected renderOption(): HTMLButtonElement {
		return renderOption();
	}
}
