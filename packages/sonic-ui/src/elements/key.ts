import { SonicElement } from '#elements/sonic-element.ts';
import { requireChild, template } from '#lib/render.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-key': SonicKey;
	}
}

const renderKey = template(
	/* HTML */ `
		<button class="sonic-key" type="button"><span class="sonic-key-cap"></span></button>
	`,
	HTMLButtonElement,
);

const holdKeys = new Set([' ', 'Enter']);

export class SonicKey extends SonicElement {
	static override readonly observedAttributes = [
		...SonicElement.observedAttributes,
		'momentary',
		'pressed',
		'toggle',
	];

	get pressed(): boolean {
		return this.hasAttribute('pressed');
	}

	set pressed(isPressed: boolean) {
		this.toggleAttribute('pressed', isPressed);
	}

	// A pointer id or a key name
	#holder: number | string | undefined;

	readonly #key = renderKey();

	attributeChangedCallback(name: string): void {
		if (name === 'disabled' && this.disabled) this.#release();
		this.#render();
	}

	protected connect(signal: AbortSignal): void {
		const key = this.#key;
		const cap = requireChild(key, '.sonic-key-cap', HTMLSpanElement);

		this.upgradeProperty('pressed');
		this.adoptChildren(() => {
			const arrivals = [...this.childNodes].filter((node) => node !== key);

			// Arrivals after a replacement take the icon's place
			if (key.parentNode === this) cap.append(...arrivals);
			else cap.replaceChildren(...arrivals);
			this.appendOnce(key);
		}, signal);
		this.#render();
		this.checkStyles(key, 'key.css');
		signal.addEventListener(
			'abort',
			() => {
				this.#release();
			},
			{ once: true },
		);

		key.addEventListener(
			'click',
			() => {
				if (!this.hasAttribute('toggle')) return;

				this.pressed = !this.pressed;
				this.dispatchEvent(new Event('change', { bubbles: true }));
			},
			{ signal },
		);
		this.#bindMomentary(key, signal);
	}

	// Not `click`, which lands a tap late by the finger's dwell
	#bindMomentary(key: HTMLButtonElement, signal: AbortSignal): void {
		const releasePointer = (event: PointerEvent): void => {
			if (event.pointerId === this.#holder) this.#release();
		};

		key.addEventListener(
			'pointerdown',
			(event) => {
				if (event.button !== 0 || !this.#isMomentary()) return;

				key.setPointerCapture(event.pointerId);
				this.#hold(event.pointerId);
			},
			{ signal },
		);
		key.addEventListener('lostpointercapture', releasePointer, { signal });
		key.addEventListener('pointercancel', releasePointer, { signal });
		key.addEventListener('pointerup', releasePointer, { signal });
		key.addEventListener(
			'keydown',
			(event) => {
				if (event.repeat || !holdKeys.has(event.key) || !this.#isMomentary()) return;

				this.#hold(event.key);
			},
			{ signal },
		);
		key.addEventListener(
			'keyup',
			(event) => {
				if (event.key === this.#holder) this.#release();
			},
			{ signal },
		);
		// Keyboard holds only; a finger on the next pad takes focus while this one is still held
		key.addEventListener(
			'blur',
			() => {
				if (typeof this.#holder === 'string') this.#release();
			},
			{ signal },
		);
	}

	#hold(holder: number | string): void {
		if (this.disabled || this.#holder !== undefined) return;

		this.#holder = holder;
		this.pressed = true;
		this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#isMomentary(): boolean {
		return this.hasAttribute('momentary') && !this.hasAttribute('toggle');
	}

	#release(): void {
		if (this.#holder === undefined) return;

		this.#holder = undefined;
		this.pressed = false;
		this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#render(): void {
		const key = this.#key;

		key.disabled = this.disabled;
		key.removeAttribute('aria-pressed');
		if (this.hasAttribute('toggle')) key.setAttribute('aria-pressed', String(this.pressed));
		this.forwardNaming(key, true);
	}
}
