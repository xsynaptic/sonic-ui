import type { SonicDial, SonicXy } from '@xsynaptic/sonic-ui';

import { formatterFor } from '#scripts/formats.ts';

function formatPad(pad: SonicXy): void {
	const [x, y] = (pad.dataset.padFormat ?? '').split(' ').map((name) => formatterFor(name));
	if (!x || !y) return;

	pad.formatValue = (value, axis) => (axis === 'x' ? x(value) : y(value));

	const screen = pad.closest('[data-pad-scope]')?.querySelector('[data-pad-screen]');
	if (!screen) return;

	const print = (): void => {
		screen.textContent = `${x(pad.x)} · ${y(pad.y)}`;
	};

	pad.addEventListener('input', print);
	print();
}

function followDials(pad: SonicXy): void {
	const dials = {
		x: document.querySelector<SonicDial>(pad.dataset.padX ?? ''),
		y: document.querySelector<SonicDial>(pad.dataset.padY ?? ''),
	};

	pad.addEventListener('input', () => {
		if (dials.x) dials.x.value = pad.x;
		if (dials.y) dials.y.value = pad.y;
	});
	for (const axis of ['x', 'y'] as const) {
		const dial = dials[axis];

		dial?.addEventListener('input', () => {
			pad[axis] = dial.value;
		});
	}
}

for (const pad of document.querySelectorAll<SonicXy>('sonic-xy[data-pad-format]')) formatPad(pad);
for (const pad of document.querySelectorAll<SonicXy>('sonic-xy[data-pad-x]')) followDials(pad);
