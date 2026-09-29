import type { SonicDial } from '#elements/dial.ts';

export function mountDial(attributes: string): { control: HTMLElement; dial: SonicDial } {
	document.body.innerHTML = `<sonic-dial ${attributes}></sonic-dial>`;

	const dial = document.querySelector('sonic-dial');
	const control = dial?.querySelector<HTMLElement>('.sonic-dial');
	if (!dial || !control) throw new Error('The dial did not render');

	return { control, dial };
}

export function nextTask(): Promise<unknown> {
	return new Promise((resolve) => setTimeout(resolve, 0));
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
