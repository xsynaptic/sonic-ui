import type { SonicSlider, SonicWavestrip } from '@xsynaptic/sonic-ui';

import { readRegions } from '#scripts/read-regions.ts';

for (const control of document.querySelectorAll<SonicSlider | SonicWavestrip>(
	':is(sonic-slider, sonic-wavestrip)[data-buffered]',
)) {
	control.buffered = readRegions(control.dataset.buffered);
}
