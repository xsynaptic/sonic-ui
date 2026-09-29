import type { SonicSlider } from '@xsynaptic/sonic-ui';

for (const slider of document.querySelectorAll<SonicSlider>('sonic-slider[data-buffered]')) {
	const edges = (slider.dataset.buffered ?? '').split(/\s+/).map(Number);
	const ranges: Array<[number, number]> = [];

	for (let index = 0; index + 1 < edges.length; index += 2) {
		ranges.push([edges[index] ?? 0, edges[index + 1] ?? 0]);
	}
	slider.buffered = ranges;
}
