import type { SonicButton } from '@xsynaptic/sonic-ui';

for (const button of document.querySelectorAll<SonicButton>('sonic-button[data-legends]')) {
	const legends = (button.dataset.legends ?? '').split(' ');

	button.addEventListener('click', () => {
		const next = legends.indexOf(button.legend ?? '') + 1;

		button.legend = legends[next % legends.length];
	});
}
