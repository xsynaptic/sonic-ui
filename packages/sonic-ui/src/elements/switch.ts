import { SonicPositionGroupElement } from '#elements/position-group.ts';
import { isUnder, optionValue } from '#elements/radio-group.ts';
import { bindDrag } from '#lib/pointer-drag.ts';
import { requireChild, template } from '#lib/render.ts';

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

	protected override claimPress(option: HTMLButtonElement, event: PointerEvent): boolean {
		if (this.#isOnBat(event)) return true;

		const target = this.pressTarget(option);
		if (this.isOptionDisabled(target) || !this.isMomentary(target)) return false;

		this.group.setPointerCapture(event.pointerId);
		this.hold(target, event.pointerId);

		return true;
	}

	protected override connect(signal: AbortSignal): void {
		const group = this.group;

		super.connect(signal);
		this.checkStyles(group, 'switch.css', ['cap']);

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

	protected override releaseTarget(option: HTMLButtonElement): HTMLButtonElement | undefined {
		const target = this.pressTarget(option);

		return this.isMomentary(target) || this.isOptionDisabled(target) ? undefined : target;
	}

	protected override render(): void {
		if (!this.isBound()) return;

		super.render();

		const options = this.options();
		if (options.length > 0) {
			this.#renderThrow(this.checkedIndex(options));
			return;
		}

		const onSide = this.orientation === 'horizontal' ? 1 : -1;

		this.group.style.setProperty('--_sonic-switch-at', String(this.checked ? onSide : -onSide));
	}

	protected renderOption(): HTMLButtonElement {
		return renderPosition();
	}

	#bindBat(group: HTMLElement, signal: AbortSignal): void {
		bindDrag<BatPress>(
			group,
			{
				grab: (event) => {
					const isOnPosition =
						event.target === this.bare || this.optionOf(event.target) !== undefined;
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

	#hasSprungFrom(option: HTMLButtonElement | undefined): boolean {
		if (!option || !this.isMomentary(option)) return false;

		this.releaseHold();

		return this.value !== optionValue(option);
	}

	#isOnBat(event: PointerEvent): boolean {
		return isUnder(this.#bat, event.clientX, event.clientY);
	}

	#pressBat(event: PointerEvent): void {
		const options = this.options();
		if (options.length === 0) {
			this.setChecked(!this.checked);
			return;
		}

		const box = this.#bat.getBoundingClientRect();
		const [start, size] =
			this.orientation === 'horizontal' ? [box.left, box.width] : [box.top, box.height];
		const offset = (this.along(event) - start) / size - 0.5;
		const index = this.checkedIndex(options);
		const side = Math.abs(offset) < pressCenterZone ? 1 : Math.sign(offset);
		const toward = this.stepFrom(index, side);
		const option = toward && toward !== options[index] ? toward : this.stepFrom(index, -side);
		if (!option) return;

		this.chooseByClick(option);
		this.#refocus(options);
	}

	#refocus(options: Array<HTMLButtonElement>): void {
		if (this.group.matches(':focus-within')) options[this.checkedIndex(options)]?.focus();
	}

	#renderThrow(index: number): void {
		const count = this.options().length;
		const at = index < 0 || count < 2 ? 0 : (2 * index) / (count - 1) - 1;

		this.group.style.setProperty('--_sonic-switch-at', String(at));
	}

	#throwBy(direction: number, pointerId: number): void {
		const options = this.options();
		if (options.length === 0) {
			this.setChecked(direction === (this.orientation === 'horizontal' ? 1 : -1));
			return;
		}

		const index = this.checkedIndex(options);
		const option = this.stepFrom(index, direction);
		if (!option || option === options[index] || this.#hasSprungFrom(options[index])) return;

		if (this.isMomentary(option)) this.hold(option, pointerId);
		else this.select(option);
		this.#refocus(options);
	}
}
