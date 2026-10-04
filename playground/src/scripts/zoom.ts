import type { SonicButton, SonicWaveform } from '@xsynaptic/sonic-ui';

interface Zoom {
	buttons: Array<SonicButton>;
	ladder: Array<number>;
	start: number;
	waveform: SonicWaveform;
}

export function bindZoom({ buttons, ladder, start, waveform }: Zoom): void {
	let rung = start;

	function render(): void {
		waveform.zoom = ladder[rung];
		for (const button of buttons) {
			const next = rung + Number(button.dataset.zoom);

			button.toggleAttribute('soft-disabled', next < 0 || next >= ladder.length);
		}
	}

	for (const button of buttons) {
		button.addEventListener('click', () => {
			rung = Math.min(Math.max(rung + Number(button.dataset.zoom), 0), ladder.length - 1);
			render();
		});
	}
	render();
}
