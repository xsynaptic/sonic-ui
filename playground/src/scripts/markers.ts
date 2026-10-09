import type { SonicWaveform, SonicWavestrip } from '@xsynaptic/sonic-ui';

type Marker = SonicWavestrip['markers'][number];

function readText(text: string | undefined) {
	if (text === undefined) return {};

	const runs = text.replaceAll('_', ' ').split('|');

	return { label: runs.join(', '), ...(runs.length > 1 ? { runs } : {}) };
}

function readMarker(token: string): Marker {
	const isDimmed = token.endsWith('~');
	const [placed = '', text] = token.replace(/~$/, '').split('=', 2);
	const [times = '', kind] = placed.split(':', 2);
	const [start = NaN, end] = times.split('..', 2).map(Number);

	return {
		start,
		...(end === undefined ? {} : { end }),
		...(kind === undefined ? {} : { kind }),
		...readText(text),
		...(isDimmed ? { dimmed: true } : {}),
	};
}

function drawRuns(marker: Marker, element: HTMLElement): void {
	const runs = Array.isArray(marker.runs) ? marker.runs.map(String) : [marker.label ?? ''];

	element.append(
		...runs.map((run, index) => {
			const part = document.createElement('span');

			part.textContent = run;
			if (index > 0) part.style.cssText = 'margin-inline-start: 0.4em; opacity: 0.65';

			return part;
		}),
	);
}

const shapes: Record<string, string> = {
	cue: 'M5 0 10 10H0Z',
	hot: 'M5 0 10 5 5 10 0 5Z',
};

function drawShape(marker: Marker, element: HTMLElement): void {
	const path = shapes[marker.kind ?? ''] ?? 'M0 0H10V10H0Z';

	element.innerHTML = `<svg viewBox="0 0 10 10" style="display: block; fill: currentcolor"><path d="${path}" /></svg>`;
}

for (const control of document.querySelectorAll<SonicWaveform | SonicWavestrip>(
	':is(sonic-waveform, sonic-wavestrip)[data-markers]',
)) {
	control.markers = (control.dataset.markers ?? '').split(/\s+/).filter(Boolean).map(readMarker);
}

for (const waveform of document.querySelectorAll<SonicWaveform>(
	'sonic-waveform[data-markers*="|"]',
)) {
	waveform.renderLabel = drawRuns;
}

for (const wavestrip of document.querySelectorAll<SonicWavestrip>(
	'sonic-wavestrip[data-marker-shapes]',
)) {
	wavestrip.renderMarker = drawShape;
}
