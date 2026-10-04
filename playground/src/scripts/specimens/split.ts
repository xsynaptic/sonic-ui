import { SonicButton, SonicSegmented, SonicSlider, SonicSplit } from '@xsynaptic/sonic-ui';

import { find } from '#scripts/find.ts';

const modeNames = ['cascade', 'equal', 'proportional'] as const;

function bindDemo(demo: Element): void {
	const split = find(demo, ':scope sonic-split', SonicSplit);
	const mode = find(demo, ':scope [data-split-mode]', SonicSegmented);
	const columns = [...split.children].map((column) => ({
		lock: find(column, ':scope [data-split-lock]', SonicButton),
		member: find(column, ':scope sonic-slider', SonicSlider),
		readout: find(column, ':scope [data-split-readout]', HTMLElement),
	}));

	mode.addEventListener('change', () => {
		const next = modeNames.find((name) => name === mode.value);

		if (next) split.mode = next;
	});
	split.addEventListener('input', () => {
		for (const { member, readout } of columns) readout.textContent = member.valueText;
	});
	for (const { lock, member } of columns) {
		lock.addEventListener('change', () => {
			member.toggleAttribute('data-sonic-locked', lock.pressed);
		});
	}
}

for (const demo of document.querySelectorAll('[data-split-demo]')) bindDemo(demo);
