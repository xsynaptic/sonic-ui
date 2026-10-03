import type { SonicWavestrip } from '@xsynaptic/sonic-ui';

import { seededPeaks } from '#scripts/seeded-peaks.ts';

for (const strip of document.querySelectorAll<SonicWavestrip>('sonic-wavestrip[data-peaks]')) {
	const { peaks = '' } = strip.dataset;

	strip.peaks = peaks === 'flat' ? Array.from({ length: 64 }, () => 1) : seededPeaks(Number(peaks));
}
