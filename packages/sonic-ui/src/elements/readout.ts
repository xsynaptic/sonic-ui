import { requireChild } from '#lib/render.ts';

interface ReadoutView {
	anchor: HTMLElement;
	isOpen: boolean;
	text: string | undefined;
}

// happy-dom has no popover API
const canPopover = 'togglePopover' in HTMLElement.prototype;

let readoutCount = 0;

export class Readout {
	#anchor: HTMLElement | undefined;

	readonly #bubble: HTMLElement;

	readonly #name = `--sonic-readout-${String((readoutCount += 1))}`;

	readonly #text: HTMLElement;

	constructor(bubble: HTMLElement) {
		this.#bubble = bubble;
		this.#text = requireChild(bubble, 'span', HTMLElement);
		bubble.style.setProperty('position-anchor', this.#name);
	}

	close(): void {
		this.#toggle(false);
	}

	show({ anchor, isOpen, text }: ReadoutView): void {
		if (anchor !== this.#anchor) {
			this.#anchor?.style.removeProperty('anchor-name');
			anchor.style.setProperty('anchor-name', this.#name);
			this.#anchor = anchor;
		}

		this.#text.hidden = text === undefined;
		if (text !== undefined) this.#text.textContent = text;
		this.#toggle(isOpen);
	}

	#toggle(isOpen: boolean): void {
		if (canPopover && this.#bubble.isConnected) this.#bubble.togglePopover(isOpen);
	}
}
