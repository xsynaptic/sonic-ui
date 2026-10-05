import { readMsProperty } from '#lib/read-ms-property.ts';

const keyRevealMs = 1000;

const revealMs = 250;

export function revealDelay(control: Element): number {
	return Math.max(0, readMsProperty(getComputedStyle(control), '--_sonic-reveal-delay', revealMs));
}

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

	press(isDown: boolean, delayMs = revealMs): void {
		this.conceal('drag');
		if (!isDown) {
			this.#onLapse();
			return;
		}

		this.#holdTimer = setTimeout(() => {
			this.reveal('drag');
			this.#onLapse();
		}, delayMs);
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
