import type { SonicTicker } from '@xsynaptic/sonic-ui';

import { SonicToggle } from '@xsynaptic/sonic-ui';

import { find } from '#scripts/find.ts';

const paused = find(document, '[data-ticker-paused]', SonicToggle);

paused.addEventListener('change', () => {
	for (const ticker of document.querySelectorAll<SonicTicker>('sonic-ticker[data-ticker]')) {
		ticker.paused = paused.checked;
	}
});
