import type { ToggleTravel } from '#lib/toggle-travel.ts';

import { SonicPositionGroupElement } from '#elements/position-group.ts';
import { isUnder } from '#elements/radio-group.ts';
import { dragThresholdPx } from '#lib/drag-step.ts';
import { bindDrag } from '#lib/pointer-drag.ts';
import { enabledEnds } from '#lib/positions.ts';
import { placeChildren, requireChild, template } from '#lib/render.ts';
import { positionAt, travelFrom } from '#lib/toggle-travel.ts';

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

const pressSlop = 2;

interface CapDrag {
	hasMoved: boolean;
	isHolding: boolean;
	isPress: boolean;
	marked: HTMLButtonElement;
	position: number;
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
		if (__DEV__)
			this.checkStyles(this.group, 'toggle.css', {
				property: 'margin-top',
				ratio: '--_sonic-toggle-gap-ratio',
				selector: '.sonic-toggle-cap',
			});
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
		this.group.style.setProperty('--_sonic-toggle-count', String(this.positions().length));
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
					if (!drag.isPress || drag.isHolding || this.isDisabled()) return;
					if (!isUnder(this.group, event.clientX, event.clientY)) return;

					this.#press(drag.position);
				},
				move: (drag, event) => {
					// A held finger wobbles, and a drag back across halfway would let go
					if (drag.isHolding || this.isDisabled()) return;
					const pointer = this.along(event);
					const moved = Math.abs(pointer - drag.start);
					if (!drag.hasMoved && moved < drag.thresholdPx) return;

					drag.hasMoved = true;
					this.toggleState('dragging', true);
					if (moved >= pressSlop * drag.thresholdPx) drag.isPress = false;
					if (this.#slideTo(positionAt(drag.travel, pointer), event.pointerId))
						drag.isPress = false;
				},
				release: (drag) => {
					delete drag.marked.dataset.sonicPressed;
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

	#fixedLegend(): Element | undefined {
		return [...this.children].find((child) => child !== this.group && !super.isMirrored(child));
	}

	#grab(event: PointerEvent): CapDrag | undefined {
		const position = this.pressedIndex(event.target);
		if (this.isDisabled() || position < 0) return undefined;

		const isOnCap = isUnder(this.#cap, event.clientX, event.clientY);
		const travel = this.#travel(event, isOnCap);
		if (!travel || (!isOnCap && this.isOptionDisabled(position))) return undefined;

		const marked = this.options()[position] ?? this.bare;

		marked.toggleAttribute('data-sonic-pressed', true);

		return {
			hasMoved: false,
			isHolding: this.#holdFrom(position, event.pointerId),
			isPress: true,
			marked,
			position,
			start: this.along(event),
			thresholdPx: dragThresholdPx(event.pointerType),
			travel,
		};
	}

	#holdFrom(position: number, pointerId: number): boolean {
		const target = this.pressTarget(position);
		if (!this.isMomentary(target) || this.isOptionDisabled(target)) return false;

		this.hold(target, pointerId);

		return true;
	}

	#placeCap(at: number): void {
		this.group.style.setProperty('--_sonic-toggle-at', String(at));
	}

	#press(position: number): void {
		const target = this.pressTarget(position);
		if (this.isOptionDisabled(target)) return;

		this.select(target);
		this.refocusAt(target);
	}

	#restingAt(): number {
		return Math.max(0, this.checkedIndex());
	}

	#slideTo(at: number, pointerId: number): boolean {
		const crossed = Math.round(at);

		this.#draggedTo = at;
		this.#placeCap(at);
		if (this.isChecked(crossed)) return false;

		this.releaseHold();
		if (this.isOptionDisabled(crossed) || this.isChecked(crossed)) return false;

		if (this.isMomentary(crossed)) this.hold(crossed, pointerId);
		else this.select(crossed);
		this.refocusAt(crossed);

		return true;
	}

	#travel(event: PointerEvent, isOnCap: boolean): ToggleTravel | undefined {
		const [first, last] = enabledEnds(this.positions());
		if (first < 0) return undefined;

		const box = this.#well.getBoundingClientRect();
		const [start, length, thickness] =
			this.orientation === 'vertical'
				? [box.top, box.height, box.width]
				: [box.left, box.width, box.height];

		return travelFrom({
			at: this.#restingAt(),
			count: this.positions().length,
			first,
			isOnCap,
			last,
			pointer: this.along(event),
			well: { length, start, thickness },
		});
	}
}
