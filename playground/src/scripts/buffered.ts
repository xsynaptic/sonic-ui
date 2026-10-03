import type { SonicSlider, SonicWavestrip } from '@xsynaptic/sonic-ui';

import { readSpans } from '#scripts/read-spans.ts';

for (const control of document.querySelectorAll<SonicSlider | SonicWavestrip>(
	':is(sonic-slider, sonic-wavestrip)[data-buffered]',
)) {
	control.buffered = readSpans(control.dataset.buffered);
}
