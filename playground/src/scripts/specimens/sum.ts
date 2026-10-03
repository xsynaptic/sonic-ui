import { SonicKey, SonicSegmented, SonicSlider, SonicSum } from '@xsynaptic/sonic-ui';

import { find } from '#scripts/find.ts';

const modeNames = ['cascade', 'equal', 'proportional'] as const;

function bindDemo(demo: Element): void {
	const sum = find(demo, ':scope sonic-sum', SonicSum);
	const mode = find(demo, ':scope [data-sum-mode]', SonicSegmented);
	const columns = [...sum.children].map((column) => ({
		lock: find(column, ':scope [data-sum-lock]', SonicKey),
		member: find(column, ':scope sonic-slider', SonicSlider),
		readout: find(column, ':scope [data-sum-readout]', HTMLElement),
	}));

	mode.addEventListener('change', () => {
		const next = modeNames.find((name) => name === mode.value);

		if (next) sum.mode = next;
	});
	sum.addEventListener('input', () => {
		for (const { member, readout } of columns) readout.textContent = member.valueText;
	});
	for (const { lock, member } of columns) {
		lock.addEventListener('change', () => {
			member.toggleAttribute('data-sonic-locked', lock.pressed);
		});
	}
}

for (const demo of document.querySelectorAll('[data-sum-demo]')) bindDemo(demo);
