import type { SonicKey } from '@xsynaptic/sonic-ui';

for (const key of document.querySelectorAll<SonicKey>('sonic-key[data-two-colour]')) {
	key.addEventListener('change', () => {
		key
			.querySelector(':scope > .sonic-led')
			?.setAttribute('data-sonic-lit', key.pressed ? '' : 'alt');
	});
}
