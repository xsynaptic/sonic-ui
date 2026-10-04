import type { SonicDial, SonicXy } from '@xsynaptic/sonic-ui';

import { formatterFor } from '#scripts/formats.ts';

function formatXy(xy: SonicXy): void {
	const [x, y] = (xy.dataset.xyFormat ?? '').split(' ').map((name) => formatterFor(name));
	if (!x || !y) return;

	xy.formatValue = (value, axis) => (axis === 'x' ? x(value) : y(value));

	const screen = xy.closest('[data-xy-scope]')?.querySelector('[data-xy-screen]');
	if (!screen) return;

	const print = (): void => {
		screen.textContent = `${x(xy.x)} · ${y(xy.y)}`;
	};

	xy.addEventListener('input', print);
	print();
}

function followDials(xy: SonicXy): void {
	const dials = {
		x: document.querySelector<SonicDial>(xy.dataset.xyX ?? ''),
		y: document.querySelector<SonicDial>(xy.dataset.xyY ?? ''),
	};

	xy.addEventListener('input', () => {
		if (dials.x) dials.x.value = xy.x;
		if (dials.y) dials.y.value = xy.y;
	});
	for (const axis of ['x', 'y'] as const) {
		const dial = dials[axis];

		dial?.addEventListener('input', () => {
			xy[axis] = dial.value;
		});
	}
}

for (const xy of document.querySelectorAll<SonicXy>('sonic-xy[data-xy-format]')) formatXy(xy);
for (const xy of document.querySelectorAll<SonicXy>('sonic-xy[data-xy-x]')) followDials(xy);
