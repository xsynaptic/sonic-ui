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

const renderSegment = template(
	/* HTML */ `
		<button class="sonic-segmented-segment" role="radio" type="button">
			<span class="sonic-segmented-cap"></span>
		</button>
	`,
	HTMLButtonElement,
);

export class SonicSegmented extends SonicRadioGroupElement {
	protected readonly group = renderSegmented();

	protected override connect(signal: AbortSignal): void {
		super.connect(signal);
		this.checkStyles(this.group, 'segmented.css');
	}

	protected renderOption(): HTMLButtonElement {
		return renderSegment();
	}
}
