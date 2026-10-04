import type { SonicButton } from '@xsynaptic/sonic-ui';

for (const button of document.querySelectorAll<SonicButton>('sonic-button[data-two-colour]')) {
	button.addEventListener('change', () => {
		button
			.querySelector(':scope > .sonic-led')
			?.setAttribute('data-sonic-lit', button.pressed ? '' : 'alt');
	});
}
