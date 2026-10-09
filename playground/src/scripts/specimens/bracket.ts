import type { SonicRegion, SonicWaveform, SonicWavestrip } from '@xsynaptic/sonic-ui';

function link(waveform: SonicWaveform, strip: SonicWavestrip, region: SonicRegion): () => void {
	const middle = (): number => (region.start + region.end) / 2;
	// The waveform answers from its last painted frame, so the bracket is placed after whatever moved the window has drawn
	const follow = (): void => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				const box = waveform.querySelector('canvas')?.getBoundingClientRect();
				if (!box) return;

				region.start = waveform.valueFromPoint(box.left, box.top);
				region.end = waveform.valueFromPoint(box.right, box.top);
			});
		});
	};

	waveform.addEventListener('input', () => {
		strip.value = waveform.value;
		follow();
	});
	waveform.addEventListener('sonic-zoom', follow);
	strip.addEventListener('input', (event) => {
		if (event.target === region) {
			strip.preview = middle();
			return;
		}

		waveform.value = strip.value;
		follow();
	});
	strip.addEventListener('change', (event) => {
		if (event.target !== region) return;

		strip.preview = undefined;
		strip.value = middle();
		waveform.value = strip.value;
		follow();
	});
	new ResizeObserver(follow).observe(waveform);
	follow();

	return follow;
}

for (const group of document.querySelectorAll('[data-bracket-specimen]')) {
	const waveform = group.querySelector<SonicWaveform>('sonic-waveform');
	const strip = group.querySelector<SonicWavestrip>('sonic-wavestrip');
	const region = group.querySelector<SonicRegion>('sonic-region');

	if (!waveform || !strip || !region) continue;

	const follow = link(waveform, strip, region);

	// A write to `zoom` fires nothing, so a zoom button says so itself
	for (const button of group.querySelectorAll('[data-zoom]')) {
		button.addEventListener('click', follow);
	}
}
