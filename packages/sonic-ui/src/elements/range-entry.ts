interface Press {
	time: number;
	x: number;
	y: number;
}

interface RangeEntryOptions {
	commit: (text: string) => void;
	text: () => string;
	toggle: (isOpen: boolean) => void;
}

// Not `dblclick`, which iOS may not deliver under `touch-action: none`
const doublePressMs = 500;
const doublePressPx = 4;

function isDoublePress(previous: Press | undefined, next: Press): boolean {
	if (!previous) return false;

	return (
		next.time - previous.time < doublePressMs &&
		Math.hypot(next.x - previous.x, next.y - previous.y) < doublePressPx
	);
}

export class RangeEntry {
	get isOpen(): boolean {
		return this.#isOpen;
	}

	readonly #input: HTMLInputElement;

	#isOpen = false;

	#lastPress: Press | undefined;

	readonly #options: RangeEntryOptions;

	constructor(input: HTMLInputElement, options: RangeEntryOptions) {
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

		// The field's own events would reach the host's listeners as if the value had moved
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

	// Closes first, so the committed value renders with the control's role back in place
	close(isCommitting: boolean): void {
		if (!this.#isOpen) return;

		this.#isOpen = false;
		this.#input.hidden = true;
		this.#options.toggle(false);
		if (isCommitting) this.#options.commit(this.#input.value);
	}

	forgetPress(): void {
		this.#lastPress = undefined;
	}

	open(): void {
		const input = this.#input;

		this.#isOpen = true;
		input.value = this.#options.text();
		input.hidden = false;
		this.#options.toggle(true);
		input.focus();
		input.select();
	}

	press(event: PointerEvent): boolean {
		const press = { time: event.timeStamp, x: event.clientX, y: event.clientY };
		const previous = this.#lastPress;

		this.#lastPress = press;
		if (!isDoublePress(previous, press)) return false;

		this.#lastPress = undefined;

		return true;
	}
}
