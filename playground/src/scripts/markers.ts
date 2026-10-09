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

function drawHotCue(marker: Marker, element: HTMLElement): void {
	const badge = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

	badge.setAttribute('viewBox', '0 0 10 10');
	badge.style.display = 'block';
	badge.innerHTML =
		'<rect width="10" height="10" rx="2" fill="currentcolor" /><text x="5" y="7.7" fill="#18181b" font-family="ui-monospace, monospace" font-size="7.5" font-weight="700" text-anchor="middle"></text>';

	const letter = badge.querySelector('text');

	if (letter) letter.textContent = marker.label ?? '';
	element.replaceChildren(badge);
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
	wavestrip.renderMarker = drawHotCue;
}
