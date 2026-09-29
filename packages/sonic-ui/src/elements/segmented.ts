import { SonicFormElement } from '#elements/form-element.ts';
import { copyNode } from '#lib/copy-node.ts';
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

interface Press {
	pointerId: number;
	segment: HTMLButtonElement | undefined;
}

function isUnder(segment: Element, x: number, y: number): boolean {
	const box = segment.getBoundingClientRect();

	return x >= box.left && x < box.right && y >= box.top && y < box.bottom;
}

function segmentValue(segment: Element): string | undefined {
	return segment.querySelector<HTMLElement | SVGElement>('[data-sonic-value]')?.dataset.sonicValue;
}

export class SonicSegmented extends SonicFormElement {
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

	#press: Press | undefined;

	readonly #segmented = renderSegmented();

	#value = '';

	attributeChangedCallback(name: string): void {
		if (name === 'value') this.#value = this.getAttribute('value') ?? '';
		this.render();
	}

	protected connect(signal: AbortSignal): void {
		const segmented = this.#segmented;

		this.upgradeProperties('value');
		this.mirrorChildren(
			{
				control: segmented,
				copy: (options) => {
					this.#copyOptions(options);
				},
				isCopied: (child) => child instanceof Element && child.matches('[data-sonic-value]'),
			},
			signal,
		);
		this.checkStyles(segmented, 'segmented.css');

		segmented.addEventListener(
			'click',
			(event) => {
				if (event instanceof PointerEvent && event.pointerType !== '') return;

				const segment = this.#segmentOf(event.target);
				if (segment) this.#select(segment);
			},
			{ signal },
		);
		this.#bindPress(segmented, signal);
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

	protected override focusTarget(): HTMLElement | undefined {
		return this.#segments().find((segment) => segment.tabIndex === 0);
	}

	// As a radio group, only a checked option submits
	protected render(): void {
		const segmented = this.#segmented;
		const segments = this.#segments();
		const checked = segments.find((segment) => segmentValue(segment) === this.#value);
		const focusable = checked ?? segments[0];

		for (const segment of segments) {
			segment.disabled = this.isDisabled();
			segment.setAttribute('aria-checked', String(segment === checked));
			segment.tabIndex = segment === focusable ? 0 : -1;
		}
		this.forwardNaming(segmented, true);
		// eslint-disable-next-line unicorn/no-null -- `null` submits nothing
		this.writeFormValue(checked ? this.#value : null, this.#value);
	}

	protected restoreState(state: string): void {
		this.value = state;
	}

	#bindPress(segmented: HTMLElement, signal: AbortSignal): void {
		const isOwn = (event: PointerEvent): boolean => event.pointerId === this.#press?.pointerId;
		const release = (event: PointerEvent): void => {
			if (isOwn(event)) this.#hold(undefined);
		};

		segmented.addEventListener(
			'pointerdown',
			(event) => {
				const segment = this.#segmentOf(event.target);
				if (!segment || event.button !== 0 || this.isDisabled()) return;

				segmented.setPointerCapture(event.pointerId);
				this.#hold({ pointerId: event.pointerId, segment });
			},
			{ signal },
		);
		segmented.addEventListener(
			'pointermove',
			(event) => {
				if (!isOwn(event)) return;

				this.#hold({
					pointerId: event.pointerId,
					segment: this.#segments().find((segment) =>
						isUnder(segment, event.clientX, event.clientY),
					),
				});
			},
			{ signal },
		);
		segmented.addEventListener(
			'pointerup',
			(event) => {
				const segment = isOwn(event) ? this.#press?.segment : undefined;

				release(event);
				if (!segment || this.isDisabled()) return;

				this.#select(segment);
				if (segmented.matches(':focus-within')) segment.focus();
			},
			{ signal },
		);
		segmented.addEventListener('pointercancel', release, { signal });
		segmented.addEventListener('lostpointercapture', release, { signal });
		signal.addEventListener(
			'abort',
			() => {
				this.#hold(undefined);
			},
			{ once: true },
		);
	}

	// Segments are kept by position, so focus follows its option's value across a reorder
	#copyOptions(options: Array<Node>): void {
		const segmented = this.#segmented;
		const segments = this.#segments();
		const focused = this.#segmentOf(segmented.querySelector(':scope > :focus'));
		const focusedValue = focused && segmentValue(focused);

		for (const [index, option] of options.entries()) {
			let segment = segments[index];
			if (!segment) {
				segment = renderSegment();
				segmented.append(segment);
			}

			segment.firstElementChild?.replaceChildren(copyNode(option));
		}
		for (const segment of segments.slice(options.length)) segment.remove();
		this.render();
		if (focused) this.#refocus(focused, focusedValue);
	}

	#hold(press: Press | undefined): void {
		this.#press = press;
		for (const segment of this.#segments()) {
			segment.toggleAttribute('data-sonic-pressed', segment === press?.segment);
		}
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

	#refocus(focused: HTMLButtonElement, value: string | undefined): void {
		const segments = this.#segments();
		const next =
			segments.find((segment) => segmentValue(segment) === value) ??
			segments.find((segment) => segment.tabIndex === 0);

		if (next !== focused) next?.focus();
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
