import { SonicFormElement } from '#elements/form-element.ts';
import { copyNode } from '#lib/copy-node.ts';
import { bindDrag } from '#lib/pointer-drag.ts';
import { placeChildren } from '#lib/render.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

// RTL is not mirrored
const keySteps = new Map([
	['ArrowDown', 1],
	['ArrowLeft', -1],
	['ArrowRight', 1],
	['ArrowUp', -1],
]);

interface Press {
	boxes: Array<[HTMLButtonElement, DOMRect]>;
	option: HTMLButtonElement | undefined;
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

	protected chooseByClick(option: HTMLButtonElement): void {
		this.select(option);
	}

	protected chooseByKey(option: HTMLButtonElement, _event: KeyboardEvent): void {
		this.select(option);
		option.focus();
	}

	protected claimPress(_option: HTMLButtonElement, _event: PointerEvent): boolean {
		return false;
	}

	protected connect(signal: AbortSignal): void {
		const group = this.group;

		this.upgradeProperties('value');
		this.mirrorChildren(
			{
				control: group,
				copy: copyNode,
				isCopied: (child) => child instanceof Element && child.matches('[data-sonic-value]'),
				place: (copies) => {
					this.#copyOptions(copies);
				},
			},
			signal,
		);

		group.addEventListener(
			'click',
			(event) => {
				if (event instanceof PointerEvent && event.pointerType !== '') return;

				const option = this.optionOf(event.target);
				if (option) this.chooseByClick(option);
			},
			{ signal },
		);
		this.#bindPress(group, signal);
		group.addEventListener(
			'keydown',
			(event) => {
				if (event.defaultPrevented) return;

				const option = this.optionOf(event.target);
				const next = option && this.#keyTarget(option, event.key);
				if (!next) return;

				event.preventDefault();
				this.chooseByKey(next, event);
			},
			{ signal },
		);
	}

	protected override focusTarget(): HTMLElement | undefined {
		return this.options().find((option) => option.tabIndex === 0);
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

	protected releaseTarget(option: HTMLButtonElement): HTMLButtonElement | undefined {
		return option;
	}

	protected render(): void {
		if (!this.isBound()) return;

		const options = this.options();
		const checked = options.find((option) => optionValue(option) === this.#value);
		const focusable = checked ?? options[0];
		const isDisabled = this.isDisabled();

		for (const option of options) {
			writeAttribute(option, 'disabled', isDisabled ? '' : undefined);
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

	protected select(option: HTMLButtonElement): void {
		const next = optionValue(option);
		if (next === undefined || next === this.#value) return;

		this.value = next;
		this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#bindPress(group: HTMLElement, signal: AbortSignal): void {
		bindDrag<Press>(
			group,
			{
				grab: (event) => {
					const option = this.optionOf(event.target);
					if (!option || this.isDisabled() || this.claimPress(option, event)) return;

					const boxes = this.#optionBoxes();

					this.#markPressed(option);

					return { boxes, option };
				},
				lift: (press) => {
					if (!press.option || this.isDisabled()) return;

					const option = this.releaseTarget(press.option);
					if (!option) return;

					this.select(option);
					if (group.matches(':focus-within')) option.focus();
				},
				move: (press, event) => {
					press.option = press.boxes.find(([, box]) =>
						isInside(box, event.clientX, event.clientY),
					)?.[0];
					this.#markPressed(press.option);
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

	#keyTarget(option: HTMLButtonElement, key: string): HTMLButtonElement | undefined {
		const options = this.options();

		if (key === 'Home') return options[0];
		if (key === 'End') return options.at(-1);

		const step = keySteps.get(key);
		if (step === undefined) return undefined;

		const index = options.indexOf(option) + step;
		if (this.isWrapping()) return options[(index + options.length) % options.length];

		return options[Math.min(Math.max(index, 0), options.length - 1)];
	}

	#markPressed(pressed: HTMLButtonElement | undefined): void {
		for (const option of this.options()) {
			option.toggleAttribute('data-sonic-pressed', option === pressed);
		}
	}

	#optionBoxes(): Array<[HTMLButtonElement, DOMRect]> {
		return this.options().map((option) => [option, option.getBoundingClientRect()]);
	}

	#refocus(focused: HTMLButtonElement, value: string | undefined): void {
		const options = this.options();
		const next =
			options.find((option) => optionValue(option) === value) ??
			options.find((option) => option.tabIndex === 0);

		if (next !== focused) next?.focus();
	}
}
