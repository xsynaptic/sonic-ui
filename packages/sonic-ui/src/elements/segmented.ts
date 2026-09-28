import { SonicElement } from '#elements/sonic-element.ts';
import { template } from '#lib/render.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-segmented': SonicSegmented;
	}
}

const renderSegmented = template(
	/* HTML */ `<div class="sonic-segmented" role="radiogroup"></div>`,
	HTMLDivElement,
);

const renderSegment = template(
	/* HTML */ `
		<button class="sonic-segmented-segment" role="radio" type="button">
			<span class="sonic-segmented-cap"></span>
		</button>
	`,
	HTMLButtonElement,
);

// RTL is not mirrored
const keySteps = new Map([
	['ArrowDown', 1],
	['ArrowLeft', -1],
	['ArrowRight', 1],
	['ArrowUp', -1],
]);

function segmentValue(segment: Element): string | undefined {
	return segment.querySelector<HTMLElement | SVGElement>('[data-sonic-value]')?.dataset.sonicValue;
}

export class SonicSegmented extends SonicElement {
	static override readonly observedAttributes = [...SonicElement.observedAttributes, 'value'];

	// As on the range, the property never writes the `value` attribute back
	get value(): string {
		return this.#value;
	}

	set value(next: string) {
		this.#value = next;
		this.#render();
	}

	readonly #segmented = renderSegmented();

	#value = '';

	attributeChangedCallback(name: string): void {
		if (name === 'value') this.#value = this.getAttribute('value') ?? '';
		this.#render();
	}

	protected connect(signal: AbortSignal): void {
		const segmented = this.#segmented;

		this.upgradeProperty('value');
		this.adoptChildren(() => {
			const segments = [...this.querySelectorAll(':scope > [data-sonic-value]')];
			const isReplaced = segmented.parentNode !== this;

			// Arrivals after a replacement take the old options' place
			if (isReplaced) segmented.replaceChildren();
			for (const child of segments) {
				const segment = renderSegment();

				segment.firstElementChild?.append(child);
				segmented.append(segment);
			}
			this.appendOnce(segmented);
			if (isReplaced || segments.length > 0) this.#render();
		}, signal);
		this.#render();
		this.checkStyles(segmented, 'segmented.css');

		segmented.addEventListener(
			'click',
			(event) => {
				const segment = this.#segmentOf(event.target);
				if (segment) this.#select(segment);
			},
			{ signal },
		);
		segmented.addEventListener(
			'keydown',
			(event) => {
				if (event.defaultPrevented) return;

				const segment = this.#segmentOf(event.target);
				const next = segment && this.#keyTarget(segment, event.key);
				if (!next) return;

				event.preventDefault();
				this.#select(next);
				next.focus();
			},
			{ signal },
		);
	}

	#keyTarget(segment: HTMLButtonElement, key: string): HTMLButtonElement | undefined {
		const segments = this.#segments();

		if (key === 'Home') return segments[0];
		if (key === 'End') return segments.at(-1);

		const step = keySteps.get(key);
		if (step === undefined) return undefined;

		const index = segments.indexOf(segment) + step;

		return segments[(index + segments.length) % segments.length];
	}

	#render(): void {
		const segmented = this.#segmented;
		const segments = this.#segments();
		const checked = segments.find((segment) => segmentValue(segment) === this.#value);
		const focusable = checked ?? segments[0];

		for (const segment of segments) {
			segment.disabled = this.disabled;
			segment.setAttribute('aria-checked', String(segment === checked));
			segment.tabIndex = segment === focusable ? 0 : -1;
		}
		this.forwardNaming(segmented, true);
	}

	#segmentOf(target: EventTarget | null): HTMLButtonElement | undefined {
		if (!(target instanceof Element)) return undefined;

		const segment = target.closest('.sonic-segmented-segment');

		return segment instanceof HTMLButtonElement && segment.parentElement === this.#segmented
			? segment
			: undefined;
	}

	#segments(): Array<HTMLButtonElement> {
		return [...this.#segmented.children].filter(
			(child): child is HTMLButtonElement => child instanceof HTMLButtonElement,
		);
	}

	#select(segment: HTMLButtonElement): void {
		const next = segmentValue(segment);
		if (next === undefined || next === this.#value) return;

		this.value = next;
		this.dispatchEvent(new Event('change', { bubbles: true }));
	}
}
