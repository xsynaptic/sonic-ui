import type { SonicDial } from '#elements/dial.ts';
import type { ValueMapping, ValueSpec } from '#lib/value-mapping.ts';

import { valueMapping } from '#lib/value-mapping.ts';

export function mountControl<Tag extends keyof HTMLElementTagNameMap>(
	tag: Tag,
	attributes: string,
	children = '',
): { control: HTMLElement; host: HTMLElementTagNameMap[Tag] } {
	document.body.innerHTML = `<${tag} ${attributes}>${children}</${tag}>`;

	const host = document.querySelector(tag);
	const control = host?.querySelector<HTMLElement>(`.${tag}`);
	if (!host || !control) throw new Error(`The ${tag} did not render`);

	return { control, host };
}

export function mountDial(attributes: string): { control: HTMLElement; dial: SonicDial } {
	const { control, host } = mountControl('sonic-dial', attributes);

	return { control, dial: host };
}

export function nextTask(): Promise<unknown> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

export function pointerAt(target: EventTarget, type: string, init: PointerEventInit = {}): void {
	target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, ...init }));
}

export function pressKey(target: HTMLElement, key: string): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key });

	target.dispatchEvent(event);

	return event;
}

export function recordEvents(target: EventTarget): Array<string> {
	const events: Array<string> = [];

	for (const type of ['input', 'change']) {
		target.addEventListener(type, () => {
			events.push(type);
		});
	}

	return events;
}

export function mappingOf(spec: Partial<ValueSpec> = {}): ValueMapping {
	return valueMapping({
		isNotched: false,
		isWrapping: false,
		max: 100,
		min: 0,
		step: 1,
		taper: 'linear',
		...spec,
	});
}
