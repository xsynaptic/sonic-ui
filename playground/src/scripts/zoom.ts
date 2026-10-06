import type { SonicButton, SonicWaveform } from '@xsynaptic/sonic-ui';

interface Zoom {
	buttons: Array<SonicButton>;
	ladder: Array<number>;
	start: number;
	waveform: SonicWaveform;
}

function nextRung(ladder: Array<number>, zoom: number, direction: number): number {
	const rung =
		direction > 0 ? ladder.find((step) => step > zoom) : ladder.findLast((step) => step < zoom);

	return rung ?? zoom;
}

export function bindZoom({ buttons, ladder, start, waveform }: Zoom): void {
	const lowest = ladder[0];
	const highest = ladder.at(-1);
	const first = ladder[start];

	if (lowest === undefined || highest === undefined || first === undefined) return;

	let zoom = first;

	function render(): void {
		waveform.zoom = zoom;
		for (const button of buttons) {
			button.toggleAttribute(
				'soft-disabled',
				nextRung(ladder, zoom, Number(button.dataset.zoom)) === zoom,
			);
		}
	}

	for (const button of buttons) {
		button.addEventListener('click', () => {
			zoom = nextRung(ladder, zoom, Number(button.dataset.zoom));
			render();
		});
	}
	waveform.zoomable = true;
	waveform.zoomMin = lowest;
	waveform.zoomMax = highest;
	waveform.addEventListener('sonic-zoom', () => {
		zoom = waveform.zoom;
		render();
	});
	render();
}
