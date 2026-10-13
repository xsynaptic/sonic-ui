import { readPxProperty } from '#lib/read-px-property.ts';

const cancelZonePx = 48;

export function outsideCancelZone(
	control: HTMLElement,
	property: string,
): (event: PointerEvent) => boolean {
	const box = control.getBoundingClientRect();
	const zone = readPxProperty(getComputedStyle(control), property, cancelZonePx);

	return (event) => event.clientY < box.top - zone || event.clientY > box.bottom + zone;
}
