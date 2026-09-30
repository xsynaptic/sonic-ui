import { SonicFormElement } from '#elements/form-element.ts';
import { copyNode } from '#lib/copy-node.ts';

// RTL is not mirrored
const keySteps = new Map([
	['ArrowDown', 1],
	['ArrowLeft', -1],
	['ArrowRight', 1],
	['ArrowUp', -1],
]);

interface Press {
	option: HTMLButtonElement | undefined;
	pointerId: number;
}

function isUnder(option: Element, x: number, y: number): boolean {
	const box = option.getBoundingClientRect();

	return x >= box.left && x < box.right && y >= box.top && y < box.bottom;
}

export function optionValue(option: Element): string | undefined {
	return option.querySelector<HTMLElement | SVGElement>('[data-sonic-value]')?.dataset.sonicValue;
}

export abstract class SonicRadioGroupElement extends SonicFormElement {
	static override readonly observedAttributes = [...SonicFormElement.observedAttributes, 'value'];

	// As on the range, the property never writes the `value` attribute back
	get value(): string {
		return this.#value;
	}

	set value(next: string) {
		if (next === this.#value) return;

		this.#value = next;
		this.render();
	}

	protected abstract readonly group: HTMLElement;

	#press: Press | undefined;

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
				copy: (originals) => {
					this.#copyOptions(originals);
				},
				isCopied: (child) => child instanceof Element && child.matches('[data-sonic-value]'),
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

	// As a radio group, only a checked option submits
	protected render(): void {
		const options = this.options();
		const checked = options.find((option) => optionValue(option) === this.#value);
		const focusable = checked ?? options[0];

		for (const option of options) {
			option.disabled = this.isDisabled();
			option.setAttribute('aria-checked', String(option === checked));
			option.tabIndex = option === focusable ? 0 : -1;
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

	protected wraps(): boolean {
		return true;
	}

	#bindPress(group: HTMLElement, signal: AbortSignal): void {
		const isOwn = (event: PointerEvent): boolean => event.pointerId === this.#press?.pointerId;
		const release = (event: PointerEvent): void => {
			if (isOwn(event)) this.#hold(undefined);
		};

		group.addEventListener(
			'pointerdown',
			(event) => {
				const option = this.optionOf(event.target);
				if (!option || event.button !== 0 || this.isDisabled()) return;
				if (this.claimPress(option, event)) return;

				group.setPointerCapture(event.pointerId);
				this.#hold({ option, pointerId: event.pointerId });
			},
			{ signal },
		);
		group.addEventListener(
			'pointermove',
			(event) => {
				if (!isOwn(event)) return;

				this.#hold({
					option: this.options().find((option) => isUnder(option, event.clientX, event.clientY)),
					pointerId: event.pointerId,
				});
			},
			{ signal },
		);
		group.addEventListener(
			'pointerup',
			(event) => {
				const pressed = isOwn(event) ? this.#press?.option : undefined;

				release(event);
				if (!pressed || this.isDisabled()) return;

				const option = this.releaseTarget(pressed);
				if (!option) return;

				this.select(option);
				if (group.matches(':focus-within')) option.focus();
			},
			{ signal },
		);
		group.addEventListener('pointercancel', release, { signal });
		group.addEventListener('lostpointercapture', release, { signal });
		signal.addEventListener(
			'abort',
			() => {
				this.#hold(undefined);
			},
			{ once: true },
		);
	}

	// Options are kept by position, so focus follows its option's value across a reorder
	#copyOptions(originals: Array<Node>): void {
		const group = this.group;
		const options = this.options();
		const focused = this.optionOf(group.querySelector(':scope > :focus'));
		const focusedValue = focused && optionValue(focused);

		for (const [index, original] of originals.entries()) {
			let option = options[index];
			if (!option) {
				option = this.renderOption();
				group.append(option);
			}

			option.firstElementChild?.replaceChildren(copyNode(original));
		}
		for (const option of options.slice(originals.length)) option.remove();
		this.render();
		if (focused) this.#refocus(focused, focusedValue);
	}

	#hold(press: Press | undefined): void {
		this.#press = press;
		for (const option of this.options()) {
			option.toggleAttribute('data-sonic-pressed', option === press?.option);
		}
	}

	#keyTarget(option: HTMLButtonElement, key: string): HTMLButtonElement | undefined {
		const options = this.options();

		if (key === 'Home') return options[0];
		if (key === 'End') return options.at(-1);

		const step = keySteps.get(key);
		if (step === undefined) return undefined;

		const index = options.indexOf(option) + step;
		if (this.wraps()) return options[(index + options.length) % options.length];

		return options[Math.min(Math.max(index, 0), options.length - 1)];
	}

	#refocus(focused: HTMLButtonElement, value: string | undefined): void {
		const options = this.options();
		const next =
			options.find((option) => optionValue(option) === value) ??
			options.find((option) => option.tabIndex === 0);

		if (next !== focused) next?.focus();
	}
}
