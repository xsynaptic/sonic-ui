const keyRevealMs = 1000;

export class ReadoutClaim {
	get isRevealed(): boolean {
		return this.#isDragging || this.#keyTimer !== undefined;
	}

	#hover: number | undefined;

	#isDragging = false;

	#isEditing = false;

	#keyTimer: ReturnType<typeof setTimeout> | undefined;

	readonly #onLapse: () => void;

	constructor(onLapse: () => void) {
		this.#onLapse = onLapse;
	}

	conceal(by: 'drag' | 'keys'): boolean {
		if (by === 'drag') {
			const wasDragging = this.#isDragging;

			this.#isDragging = false;

			return wasDragging;
		}

		clearTimeout(this.#keyTimer);

		const wasTimed = this.#keyTimer !== undefined;

		this.#keyTimer = undefined;

		return wasTimed;
	}

	edit(isOpen: boolean): void {
		this.#isEditing = isOpen;
		if (isOpen) this.#hover = undefined;
	}

	hover(value?: number): void {
		if (this.#isEditing || this.isRevealed) return;

		this.#hover = value;
	}

	reveal(by: 'drag' | 'keys'): void {
		this.#hover = undefined;
		if (by === 'drag') {
			this.#isDragging = true;
			return;
		}

		clearTimeout(this.#keyTimer);
		this.#keyTimer = setTimeout(() => {
			this.#keyTimer = undefined;
			this.#onLapse();
		}, keyRevealMs);
	}

	shown(current: number, isReadout: boolean): { isOpen: boolean; value: number | undefined } {
		if (this.#isEditing) return { isOpen: true, value: undefined };

		const isValueShown = this.isRevealed || this.#hover !== undefined;

		return { isOpen: isValueShown && isReadout, value: this.#hover ?? current };
	}
}
