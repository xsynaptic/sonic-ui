import type { SonicButton, SonicWaveform } from '@xsynaptic/sonic-ui';

import { bindZoom } from '#scripts/zoom.ts';

const zoomLadder = [20, 30, 45, 70, 105, 160, 240];

for (const group of document.querySelectorAll('[data-zoom-specimen]')) {
	const waveform = group.querySelector<SonicWaveform>('sonic-waveform');

	if (waveform) {
		bindZoom({
			buttons: [...group.querySelectorAll<SonicButton>('[data-zoom]')],
			ladder: zoomLadder,
			start: 3,
			waveform,
		});
	}
}
