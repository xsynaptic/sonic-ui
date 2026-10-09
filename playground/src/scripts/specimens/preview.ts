import type { SonicButton, SonicSlider, SonicWavestrip } from '@xsynaptic/sonic-ui';

for (const group of document.querySelectorAll('[data-preview-specimen]')) {
	const strip = group.querySelector<SonicWavestrip>('sonic-wavestrip');
	const slider = group.querySelector<SonicSlider>('sonic-slider');
	const clear = group.querySelector<SonicButton>('sonic-button');
	if (!strip || !slider || !clear) continue;

	const show = (): void => {
		strip.preview = slider.value;
	};

	slider.addEventListener('input', show);
	clear.addEventListener('click', () => {
		strip.preview = undefined;
	});
	show();
}
