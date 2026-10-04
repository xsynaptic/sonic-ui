const keyRevealMs = 1000;

export const revealMs = 250;

export class ReadoutClaim {
	get isRevealed(): boolean {
		return this.#isDragging || this.#keyTimer !== undefined;
	}

	#holdTimer: ReturnType<typeof setTimeout> | undefined;

	#hover: number | undefined;

	#isDismissed = false;

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

			clearTimeout(this.#holdTimer);
			this.#isDragging = false;

			return wasDragging;
		}

		clearTimeout(this.#keyTimer);

		const wasTimed = this.#keyTimer !== undefined;

		this.#keyTimer = undefined;

		return wasTimed;
	}

	// Stays dismissed until the hover ends, or the next pointer move would bring it straight back
	dismiss(): boolean {
		const wasHovered = this.#hover !== undefined;

		this.#hover = undefined;
		this.#isDismissed = wasHovered || this.#isDismissed;

		return wasHovered;
	}

	edit(isOpen: boolean): void {
		this.#isEditing = isOpen;
		if (isOpen) this.#hover = undefined;
	}

	hover(value?: number): void {
		if (value === undefined) this.#isDismissed = false;
		if (this.#isDismissed || this.#isEditing || this.isRevealed) return;

		this.#hover = value;
	}

	press(isDown: boolean): void {
		this.conceal('drag');
		if (!isDown) {
			this.#onLapse();
			return;
		}

		this.#holdTimer = setTimeout(() => {
			this.reveal('drag');
			this.#onLapse();
		}, revealMs);
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
