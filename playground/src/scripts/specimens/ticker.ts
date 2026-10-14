import type { SonicButton, SonicTicker } from '@xsynaptic/sonic-ui';

import { bindRun } from '#scripts/frame-loop.ts';

function setPaused(isPaused: boolean): void {
	for (const ticker of document.querySelectorAll<SonicTicker>('sonic-ticker[data-ticker]')) {
		ticker.paused = isPaused;
	}
}

bindRun([...document.querySelectorAll<SonicButton>('[data-run]')], {
	start: () => {
		setPaused(false);
	},
	stop: () => {
		setPaused(true);
	},
});
