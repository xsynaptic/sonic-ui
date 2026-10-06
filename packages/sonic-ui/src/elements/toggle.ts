import type { ToggleTravel } from '#lib/toggle-travel.ts';

import { SonicPositionGroupElement } from '#elements/position-group.ts';
import { isUnder, optionValue } from '#elements/radio-group.ts';
import { dragThresholdPx } from '#lib/drag-step.ts';
import { bindDrag } from '#lib/pointer-drag.ts';
import { placeChildren, requireChild, template } from '#lib/render.ts';
import { positionAt, travelFrom } from '#lib/toggle-travel.ts';

// eslint-disable-next-line unicorn/consistent-boolean-name -- the name bundlers and other kits use
declare const __DEV__: boolean;

declare global {
	interface HTMLElementTagNameMap {
		'sonic-toggle': SonicToggle;
	}
}

// fallow-ignore-next-line code-duplication -- each control draws its own parts
const renderToggle = template(
	/* HTML */ `
		<div class="sonic-toggle">
			<span aria-hidden="true" class="sonic-toggle-well"></span>
			<span aria-hidden="true" class="sonic-toggle-cap"></span>
		</div>
	`,
	HTMLDivElement,
);

const renderPosition = template(
	/* HTML */ `
		<button class="sonic-toggle-position" role="radio" type="button">
			<span class="sonic-toggle-legend"></span>
		</button>
	`,
	HTMLButtonElement,
);

const renderBare = template(
	/* HTML */ `<button class="sonic-toggle-position" role="switch" type="button"></button>`,
	HTMLButtonElement,
);

interface CapDrag {
	hasMoved: boolean;
	isHolding: boolean;
	position: HTMLButtonElement | undefined;
	start: number;
	thresholdPx: number;
	travel: ToggleTravel;
}

export class SonicToggle extends SonicPositionGroupElement {
	protected readonly bare = renderBare();

	protected readonly defaultOrientation = 'horizontal';

	protected readonly group = renderToggle();

	readonly #cap = requireChild(this.group, '.sonic-toggle-cap', HTMLSpanElement);

	#draggedTo: number | undefined;

	#hasWarnedOfLegends = false;

	readonly #well = requireChild(this.group, '.sonic-toggle-well', HTMLSpanElement);

	// Every press is the toggle's own, so the base's slide-off never starts
	protected override claimPress(): boolean {
		return true;
	}

	protected override connect(signal: AbortSignal): void {
		super.connect(signal);
		this.checkStyles(this.group, 'toggle.css');
		this.bare.addEventListener(
			'click',
			(event) => {
				// A pointer's press is taken on its release, before the click it sends
				if (event instanceof PointerEvent && event.pointerType !== '') return;

				this.setChecked(!this.checked);
			},
			{ signal },
		);
		this.#bindCap(signal);
	}

	protected override isMirrored(child: Node): boolean {
		return super.isMirrored(child) || child === this.#fixedLegend();
	}

	protected override placeCopies(copies: Array<Node>): void {
		const positions = copies.filter((copy) => super.isMirrored(copy));

		placeChildren(
			this.#cap,
			copies.filter((copy) => !positions.includes(copy)),
		);
		super.placeCopies(positions);
	}

	protected override render(): void {
		if (!this.isBound()) return;

		if (__DEV__) this.#checkLegends();
		this.group.style.setProperty('--_sonic-toggle-count', String(this.#stopCount()));
		this.#placeCap(this.#draggedTo ?? this.#restingAt());
		super.render();
		for (const [index, option] of this.options().entries()) {
			option.style.setProperty('--_sonic-toggle-index', String(index));
		}
	}

	protected renderOption(): HTMLButtonElement {
		return renderPosition();
	}

	#bindCap(signal: AbortSignal): void {
		bindDrag<CapDrag>(
			this.group,
			{
				grab: (event) => this.#grab(event),
				lift: (drag, event) => {
					if (drag.hasMoved || drag.isHolding || this.isDisabled()) return;
					if (!isUnder(this.group, event.clientX, event.clientY)) return;

					this.#press(drag.position);
				},
				move: (drag, event) => {
					// A held finger wobbles, and a drag back across halfway would let go
					if (drag.isHolding || this.isDisabled()) return;
					const pointer = this.along(event);
					if (!drag.hasMoved && Math.abs(pointer - drag.start) < drag.thresholdPx) return;

					drag.hasMoved = true;
					this.toggleState('dragging', true);
					this.#slideTo(positionAt(drag.travel, pointer), event.pointerId);
				},
				release: (drag) => {
					delete (drag.position ?? this.bare).dataset.sonicPressed;
					this.#draggedTo = undefined;
					this.toggleState('dragging', false);
					this.render();
				},
			},
			signal,
		);
	}

	#checkLegends(): void {
		if (!__DEV__ || this.#hasWarnedOfLegends) return;

		const count = this.options().length;
		if (count <= 3 || this.getAttribute('legends') !== 'outside') return;

		this.#hasWarnedOfLegends = true;
		console.warn(
			`<sonic-toggle> lays out legends="outside" for two or three positions, and this one has ${String(count)}`,
		);
	}

	#enabledEnds(): [number, number] {
		if (this.isBare()) return [0, 1];

		const options = this.options();
		const isEnabled = (option: HTMLButtonElement): boolean => !this.isOptionDisabled(option);

		return [options.findIndex(isEnabled), options.findLastIndex(isEnabled)];
	}

	#fixedLegend(): Element | undefined {
		return [...this.children].find((child) => child !== this.group && !super.isMirrored(child));
	}

	#grab(event: PointerEvent): CapDrag | undefined {
		const position = this.optionOf(event.target);
		if (this.isDisabled() || (!position && event.target !== this.bare)) return undefined;

		const isOnCap = isUnder(this.#cap, event.clientX, event.clientY);
		const travel = this.#travel(event, isOnCap);
		if (!travel || this.#isBlocked(position, isOnCap)) return undefined;

		(position ?? this.bare).toggleAttribute('data-sonic-pressed', true);

		return {
			hasMoved: false,
			isHolding: this.#holdFrom(position, event.pointerId),
			position,
			start: this.along(event),
			thresholdPx: dragThresholdPx(event.pointerType),
			travel,
		};
	}

	#holdFrom(position: HTMLButtonElement | undefined, pointerId: number): boolean {
		const target = position && this.pressTarget(position);
		if (!target || !this.isMomentary(target) || this.isOptionDisabled(target)) return false;

		this.hold(target, pointerId);

		return true;
	}

	#isBlocked(position: HTMLButtonElement | undefined, isOnCap: boolean): boolean {
		return !isOnCap && position !== undefined && this.isOptionDisabled(position);
	}

	// On is up, as on hardware
	#onAt(): number {
		return this.orientation === 'vertical' ? 0 : 1;
	}

	#placeCap(at: number): void {
		this.group.style.setProperty('--_sonic-toggle-at', String(at));
	}

	#press(position: HTMLButtonElement | undefined): void {
		if (!position) {
			this.setChecked(!this.checked);
			return;
		}

		const target = this.pressTarget(position);
		if (this.isOptionDisabled(target)) return;

		this.select(target);
		this.#refocus(target);
	}

	#refocus(position: HTMLButtonElement): void {
		if (this.group.matches(':focus-within')) position.focus();
	}

	#restingAt(): number {
		if (this.isBare()) return this.checked ? this.#onAt() : 1 - this.#onAt();

		return Math.max(0, this.checkedIndex(this.options()));
	}

	#slideTo(at: number, pointerId: number): void {
		const crossed = this.options()[Math.round(at)];

		this.#draggedTo = at;
		this.#placeCap(at);
		if (this.isBare()) {
			this.setChecked(Math.round(at) === this.#onAt());
			return;
		}
		if (!crossed || optionValue(crossed) === this.value) return;

		this.releaseHold();
		if (this.isOptionDisabled(crossed) || optionValue(crossed) === this.value) return;

		if (this.isMomentary(crossed)) this.hold(crossed, pointerId);
		else this.select(crossed);
		this.#refocus(crossed);
	}

	#stopCount(): number {
		return this.options().length || 2;
	}

	#travel(event: PointerEvent, isOnCap: boolean): ToggleTravel | undefined {
		const [first, last] = this.#enabledEnds();
		if (first < 0) return undefined;

		const box = this.#well.getBoundingClientRect();
		const [start, length, thickness] =
			this.orientation === 'vertical'
				? [box.top, box.height, box.width]
				: [box.left, box.width, box.height];

		return travelFrom({
			at: this.#restingAt(),
			count: this.#stopCount(),
			first,
			isOnCap,
			last,
			pointer: this.along(event),
			well: { length, start, thickness },
		});
	}
}
