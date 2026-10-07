import { SonicPositionGroupElement } from '#elements/position-group.ts';
import { isUnder } from '#elements/radio-group.ts';
import { bindDrag } from '#lib/pointer-drag.ts';
import { soleStep } from '#lib/positions.ts';
import { requireChild, template } from '#lib/render.ts';

declare const __DEV__: boolean;

declare global {
	interface HTMLElementTagNameMap {
		'sonic-switch': SonicSwitch;
	}
}

const renderSwitch = template(
	/* HTML */ `
		<div class="sonic-switch">
			<span aria-hidden="true" class="sonic-switch-bushing"></span>
			<span aria-hidden="true" class="sonic-switch-bat"></span>
		</div>
	`,
	HTMLDivElement,
);

const renderPosition = template(
	/* HTML */ `
		<button class="sonic-switch-position" role="radio" type="button">
			<span class="sonic-switch-label"></span>
		</button>
	`,
	HTMLButtonElement,
);

const renderBare = template(
	/* HTML */ `<button class="sonic-switch-position" role="switch" type="button"></button>`,
	HTMLButtonElement,
);

interface BatPress {
	hasMoved: boolean;
	last: number;
	width: number;
}

const pressCenterZone = 0.08;

export class SonicSwitch extends SonicPositionGroupElement {
	protected readonly bare = renderBare();

	protected readonly defaultOrientation = 'vertical';

	protected readonly group = renderSwitch();

	readonly #bat = requireChild(this.group, '.sonic-switch-bat', HTMLSpanElement);

	#isClickSwallowed = false;

	protected override claimPress(index: number, event: PointerEvent): boolean {
		if (this.#isOnBat(event)) return true;

		const target = this.pressTarget(index);
		if (this.isOptionDisabled(target) || !this.isMomentary(target)) return false;

		this.group.setPointerCapture(event.pointerId);
		this.hold(target, event.pointerId);

		return true;
	}

	protected override connect(signal: AbortSignal): void {
		const group = this.group;

		super.connect(signal);
		if (__DEV__)
			this.checkStyles(group, 'switch.css', {
				property: 'padding-top',
				selector: '.sonic-switch-label',
			});

		this.bare.addEventListener(
			'click',
			(event) => {
				const isSwallowed =
					this.#isClickSwallowed && event instanceof PointerEvent && event.pointerType !== '';

				this.#isClickSwallowed = false;
				if (!isSwallowed) this.setChecked(!this.checked);
			},
			{ signal },
		);
		this.bare.addEventListener(
			'pointerdown',
			() => {
				this.#isClickSwallowed = false;
			},
			{ signal },
		);
		this.#bindBat(group, signal);
	}

	protected override releaseTarget(index: number): number | undefined {
		const target = this.pressTarget(index);

		return this.isMomentary(target) || this.isOptionDisabled(target) ? undefined : target;
	}

	protected override render(): void {
		if (!this.isBound()) return;

		super.render();
		this.#renderThrow(this.checkedIndex());
	}

	protected renderOption(): HTMLButtonElement {
		return renderPosition();
	}

	#bindBat(group: HTMLElement, signal: AbortSignal): void {
		bindDrag<BatPress>(
			group,
			{
				grab: (event) => {
					const isOnPosition = this.pressedIndex(event.target) >= 0;
					if (!isOnPosition || this.isDisabled() || !this.#isOnBat(event)) return;

					return {
						hasMoved: false,
						last: this.along(event),
						width: this.#bat.getBoundingClientRect().width,
					};
				},
				lift: (press, event) => {
					if (!press.hasMoved && !this.isDisabled()) this.#pressBat(event);
					this.#isClickSwallowed = true;
				},
				move: (press, event) => {
					if (this.isDisabled()) return;

					const delta = this.along(event) - press.last;
					if (Math.abs(delta) < press.width / 4) return;

					press.hasMoved = true;
					press.last = this.along(event);
					this.#throwBy(Math.sign(delta), event.pointerId);
				},
			},
			signal,
		);
	}

	#hasSprungFrom(index: number): boolean {
		if (!this.isMomentary(index)) return false;

		this.releaseHold();

		return !this.isChecked(index);
	}

	#isOnBat(event: PointerEvent): boolean {
		return isUnder(this.#bat, event.clientX, event.clientY);
	}

	#pressBat(event: PointerEvent): void {
		const from = this.checkedIndex();
		const target = soleStep(this.positions(), from) ?? this.#sideStep(from, event);
		if (target === undefined) return;

		this.chooseByClick(target);
		this.refocusAt(this.checkedIndex());
	}

	#renderThrow(index: number): void {
		const count = this.positions().length;
		const at = index < 0 || count < 2 ? 0 : (2 * index) / (count - 1) - 1;

		this.group.style.setProperty('--_sonic-switch-at', String(at));
	}

	#sideStep(from: number, event: PointerEvent): number | undefined {
		const box = this.#bat.getBoundingClientRect();
		const [start, size] =
			this.orientation === 'horizontal' ? [box.left, box.width] : [box.top, box.height];
		const offset = (this.along(event) - start) / size - 0.5;
		const side = Math.abs(offset) < pressCenterZone ? 1 : Math.sign(offset);
		const toward = this.stepFrom(from, side);

		return toward !== undefined && toward !== from ? toward : this.stepFrom(from, -side);
	}

	#throwBy(direction: number, pointerId: number): void {
		const from = this.checkedIndex();
		const target = this.stepFrom(from, direction);
		if (target === undefined || target === from || this.#hasSprungFrom(from)) return;

		if (this.isMomentary(target)) this.hold(target, pointerId);
		else this.select(target);
		this.refocusAt(this.checkedIndex());
	}
}
