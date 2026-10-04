import type { SonicWaveform, SonicWavestrip } from '@xsynaptic/sonic-ui';

type Marker = SonicWavestrip['markers'][number];

function readMarker(token: string): Marker {
	const isDimmed = token.endsWith('~');
	const [times = '', kind] = token.replace(/~$/, '').split(':', 2);
	const [start = NaN, end] = times.split('..', 2).map(Number);

	return {
		start,
		...(end === undefined ? {} : { end }),
		...(kind === undefined ? {} : { kind }),
		...(isDimmed ? { dimmed: true } : {}),
	};
}

for (const control of document.querySelectorAll<SonicWaveform | SonicWavestrip>(
	':is(sonic-waveform, sonic-wavestrip)[data-markers]',
)) {
	control.markers = (control.dataset.markers ?? '').split(/\s+/).filter(Boolean).map(readMarker);
}
