const keyRevealMs = 1000;

export const revealMs = 250;

export class ReadoutClaim {
	get isRevealed(): boolean {
		return this.#isDragging || this.#keyTimer !== undefined;
	}

	#holdTimer: ReturnType<typeof setTimeout> | undefined;

	#isDragging = false;

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
}
