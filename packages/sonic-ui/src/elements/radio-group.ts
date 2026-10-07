import type { Position } from '#lib/positions.ts';

import { SonicFormElement } from '#elements/form-element.ts';
import { copyNode } from '#lib/copy-node.ts';
import { bindKeyPress } from '#lib/key-press.ts';
import { mirrorChildren } from '#lib/mirror-children.ts';
import { bindDrag } from '#lib/pointer-drag.ts';
import { keyTarget, stepFrom } from '#lib/positions.ts';
import { placeChildren } from '#lib/render.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

interface Press {
	boxes: Array<[number, DOMRect]>;
	index: number | undefined;
}

function isInside(box: DOMRect, x: number, y: number): boolean {
	return x >= box.left && x < box.right && y >= box.top && y < box.bottom;
}

export function isUnder(option: Element, x: number, y: number): boolean {
	return isInside(option.getBoundingClientRect(), x, y);
}

export function optionValue(option: Element): string | undefined {
	return option.querySelector<HTMLElement | SVGElement>('[data-sonic-value]')?.dataset.sonicValue;
}

export abstract class SonicRadioGroupElement extends SonicFormElement {
	static override readonly observedAttributes = [...SonicFormElement.observedAttributes, 'value'];

	get value(): string {
		return this.#value;
	}

	set value(next: string) {
		if (next === this.#value) return;

		this.#value = next;
		this.render();
	}

	protected abstract readonly group: HTMLElement;

	#value = '';

	attributeChangedCallback(name: string): void {
		if (name === 'value') this.#value = this.getAttribute('value') ?? '';
		this.render();
	}

	protected chooseByClick(index: number): void {
		this.select(index);
	}

	protected chooseByKey(index: number, _event: KeyboardEvent): void {
		this.select(index);
		this.options()[index]?.focus();
	}

	protected claimPress(_index: number, _event: PointerEvent): boolean {
		return false;
	}

	protected connect(signal: AbortSignal): void {
		const group = this.group;

		this.upgradeProperties('value');
		mirrorChildren(
			this,
			{
				control: group,
				copy: copyNode,
				isCopied: (child) => this.isMirrored(child),
				place: (copies) => {
					this.placeCopies(copies);
				},
			},
			signal,
		);

		group.addEventListener(
			'click',
			(event) => {
				if (event instanceof PointerEvent && event.pointerType !== '') return;

				const index = this.indexOf(event.target);
				if (index !== -1) this.chooseByClick(index);
			},
			{ signal },
		);
		this.#bindPress(group, signal);
		bindKeyPress(group, signal);
		group.addEventListener(
			'keydown',
			(event) => {
				if (event.defaultPrevented) return;

				const index = this.indexOf(event.target);
				const next =
					index === -1
						? undefined
						: keyTarget(this.positions(), index, { isWrapping: this.isWrapping(), key: event.key });
				if (next === undefined) return;

				event.preventDefault();
				this.chooseByKey(next, event);
			},
			{ signal },
		);
	}

	protected override focusTarget(): HTMLElement | undefined {
		return this.options().find((option) => option.tabIndex === 0);
	}

	protected indexOf(target: EventTarget | null): number {
		const option = this.optionOf(target);

		return option ? this.options().indexOf(option) : -1;
	}

	protected isMirrored(child: Node): boolean {
		return child instanceof Element && child.matches('[data-sonic-value]');
	}

	protected isOptionDisabled(index: number): boolean {
		return this.positions()[index]?.isDisabled !== false;
	}

	protected isWrapping(): boolean {
		return true;
	}

	protected optionOf(target: EventTarget | null): HTMLButtonElement | undefined {
		if (!(target instanceof Element)) return undefined;

		const option = target.closest('[role="radio"]');

		return option instanceof HTMLButtonElement && option.parentElement === this.group
			? option
			: undefined;
	}

	protected options(): Array<HTMLButtonElement> {
		return [...this.group.children].filter(
			(child): child is HTMLButtonElement =>
				child instanceof HTMLButtonElement && child.getAttribute('role') === 'radio',
		);
	}

	protected placeCopies(copies: Array<Node>): void {
		this.#copyOptions(copies);
	}

	protected positions(): Array<Position> {
		return this.options().map((option) => {
			const child = option.querySelector('[data-sonic-value]');

			return {
				isDisabled: child?.hasAttribute('data-sonic-disabled') === true,
				isMomentary: child?.hasAttribute('data-sonic-momentary') === true,
			};
		});
	}

	protected refocusAt(index: number): void {
		if (this.group.matches(':focus-within')) this.options()[index]?.focus();
	}

	protected releaseTarget(index: number): number | undefined {
		return index;
	}

	protected render(): void {
		if (!this.isBound()) return;

		const options = this.options();
		const positions = this.positions();
		const checked = options.find((option) => optionValue(option) === this.#value);
		const enabled = this.isDisabled()
			? []
			: options.filter((_option, index) => positions[index]?.isDisabled === false);
		const focusable = enabled.find((option) => option === checked) ?? enabled[0];

		for (const option of options) {
			writeAttribute(option, 'disabled', enabled.includes(option) ? undefined : '');
			writeAttribute(option, 'aria-checked', String(option === checked));
			writeAttribute(option, 'tabindex', option === focusable ? '0' : '-1');
		}
		this.forwardNaming(this.group, true);
		// eslint-disable-next-line unicorn/no-null -- `null` submits nothing
		this.writeFormValue(checked ? this.#value : null, this.#value);
	}

	protected abstract renderOption(): HTMLButtonElement;

	protected restoreState(state: string): void {
		this.value = state;
	}

	protected select(index: number): void {
		const option = this.options()[index];
		const next = option && optionValue(option);
		if (next === undefined || next === this.#value) return;

		this.value = next;
		this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	protected stepFrom(from: number, step: number): number | undefined {
		return stepFrom(this.positions(), from, { isWrapping: this.isWrapping(), step });
	}

	#bindPress(group: HTMLElement, signal: AbortSignal): void {
		bindDrag<Press>(
			group,
			{
				grab: (event) => {
					const index = this.indexOf(event.target);
					if (index === -1 || this.isDisabled() || this.isOptionDisabled(index)) return;
					if (this.claimPress(index, event)) return;

					const boxes = this.#optionBoxes();

					this.#markPressed(index);

					return { boxes, index };
				},
				lift: (press) => {
					if (press.index === undefined || this.isDisabled()) return;

					const index = this.releaseTarget(press.index);
					if (index === undefined) return;

					this.select(index);
					this.refocusAt(index);
				},
				move: (press, event) => {
					press.index = press.boxes.find(([, box]) =>
						isInside(box, event.clientX, event.clientY),
					)?.[0];
					this.#markPressed(press.index);
				},
				release: () => {
					this.#markPressed(undefined);
				},
			},
			signal,
		);
	}

	#copyOptions(copies: Array<Node>): void {
		const group = this.group;
		const options = this.options();
		const focused = this.optionOf(group.querySelector(':scope > :focus'));
		const focusedValue = focused && optionValue(focused);

		for (const [index, copy] of copies.entries()) {
			let option = options[index];
			if (!option) {
				option = this.renderOption();
				group.append(option);
			}

			if (option.firstElementChild) placeChildren(option.firstElementChild, [copy]);
		}
		for (const option of options.slice(copies.length)) option.remove();
		this.render();
		if (focused) this.#refocus(focused, focusedValue);
	}

	#markPressed(pressed: number | undefined): void {
		for (const [index, option] of this.options().entries()) {
			option.toggleAttribute('data-sonic-pressed', index === pressed);
		}
	}

	#optionBoxes(): Array<[number, DOMRect]> {
		const positions = this.positions();

		return this.options().flatMap((option, index) =>
			positions[index]?.isDisabled === false
				? [[index, option.getBoundingClientRect()] satisfies [number, DOMRect]]
				: [],
		);
	}

	#refocus(focused: HTMLButtonElement, value: string | undefined): void {
		const options = this.options();
		const next =
			options.find((option) => optionValue(option) === value) ??
			options.find((option) => option.tabIndex === 0);

		if (next !== focused) next?.focus();
	}
}
