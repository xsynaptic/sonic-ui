import { createDoublePress } from '#lib/double-press.ts';

interface ValueEntryOptions {
	commit: (text: string) => void;
	text: () => string;
	toggle: (isOpen: boolean) => void;
}

export class ValueEntry {
	get isOpen(): boolean {
		return this.#isOpen;
	}

	readonly #doublePress = createDoublePress();

	readonly #input: HTMLInputElement;

	#isOpen = false;

	#openedText = '';

	readonly #options: ValueEntryOptions;

	constructor(input: HTMLInputElement, options: ValueEntryOptions) {
		this.#input = input;
		this.#options = options;
	}

	bind(control: HTMLElement, signal: AbortSignal): void {
		const input = this.#input;

		input.addEventListener(
			'keydown',
			(event) => {
				if (event.isComposing || (event.key !== 'Enter' && event.key !== 'Escape')) return;

				event.preventDefault();
				this.close(event.key === 'Enter');
				control.focus();
			},
			{ signal },
		);
		input.addEventListener(
			'blur',
			() => {
				this.close(true);
			},
			{ signal },
		);

		for (const type of ['change', 'input']) {
			input.addEventListener(
				type,
				(event) => {
					event.stopPropagation();
				},
				{ signal },
			);
		}
		signal.addEventListener(
			'abort',
			() => {
				this.close(false);
			},
			{ once: true },
		);
	}

	close(isCommitting: boolean): void {
		if (!this.#isOpen) return;

		this.#isOpen = false;
		this.#input.hidden = true;
		this.#options.toggle(false);
		if (isCommitting && this.#input.value !== this.#openedText)
			this.#options.commit(this.#input.value);
	}

	forgetPress(): void {
		this.#doublePress.forget();
	}

	open(): void {
		const input = this.#input;

		this.#isOpen = true;
		this.#openedText = this.#options.text();
		input.value = this.#openedText;
		input.hidden = false;
		this.#options.toggle(true);
		input.focus();
		input.select();
	}

	press(event: PointerEvent): boolean {
		return this.#doublePress.press(event);
	}
}
