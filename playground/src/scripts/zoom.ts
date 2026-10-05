import type { SonicButton, SonicWaveform } from '@xsynaptic/sonic-ui';

interface Zoom {
	buttons: Array<SonicButton>;
	ladder: Array<number>;
	start: number;
	waveform: SonicWaveform;
}

const wheelRate = 0.01;
const linePx = 16;

function clamp(value: number, low: number, high: number): number {
	return Math.min(Math.max(value, low), high);
}

function nextRung(ladder: Array<number>, zoom: number, direction: number): number {
	const rung =
		direction > 0 ? ladder.find((step) => step > zoom) : ladder.findLast((step) => step < zoom);

	return rung ?? zoom;
}

export function bindZoom({ buttons, ladder, start, waveform }: Zoom): void {
	const lowest = ladder[0];
	const highest = ladder.at(-1);
	const first = ladder[start];

	if (lowest === undefined || highest === undefined || first === undefined) return;

	let zoom = first;

	function render(): void {
		waveform.zoom = zoom;
		for (const button of buttons) {
			button.toggleAttribute(
				'soft-disabled',
				nextRung(ladder, zoom, Number(button.dataset.zoom)) === zoom,
			);
		}
	}

	for (const button of buttons) {
		button.addEventListener('click', () => {
			zoom = nextRung(ladder, zoom, Number(button.dataset.zoom));
			render();
		});
	}
	waveform.querySelector<HTMLElement>('.sonic-waveform')?.addEventListener(
		'wheel',
		(event) => {
			if (!event.ctrlKey && !event.metaKey) return;

			event.preventDefault();

			const pixels =
				event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * linePx : event.deltaY;

			zoom = clamp(zoom * Math.exp(-pixels * wheelRate), lowest, highest);
			render();
		},
		{ passive: false },
	);
	render();
}
