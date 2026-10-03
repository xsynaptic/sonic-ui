import type { Hold } from '#lib/hold.ts';

import { isUnder, optionValue, SonicRadioGroupElement } from '#elements/radio-group.ts';
import { bindHold } from '#lib/hold.ts';
import { clamp } from '#lib/math.ts';
import { requireChild, template } from '#lib/render.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-lever': SonicLever;
	}
}

const renderLever = template(
	/* HTML */ `
		<div class="sonic-lever">
			<span aria-hidden="true" class="sonic-lever-bushing"></span>
			<span aria-hidden="true" class="sonic-lever-bat"></span>
		</div>
	`,
	HTMLDivElement,
);

const renderPosition = template(
	/* HTML */ `
		<button class="sonic-lever-position" role="radio" type="button">
			<span class="sonic-lever-label"></span>
		</button>
	`,
	HTMLButtonElement,
);

const renderSwitch = template(
	/* HTML */ `<button class="sonic-lever-position" role="switch" type="button"></button>`,
	HTMLButtonElement,
);

interface BatPress {
	hasMoved: boolean;
	last: number;
	pointerId: number;
}

const pressCentreZone = 0.08;

function pressedIndex(index: number, count: number, offset: number): number {
	if (count === 2) return index === 0 ? 1 : 0;

	const side = Math.abs(offset) < pressCentreZone ? 1 : Math.sign(offset);
	const next = index + side;

	return next < 0 || next >= count ? index - side : next;
}

export class SonicLever extends SonicRadioGroupElement {
	static override readonly observedAttributes = [
		...SonicRadioGroupElement.observedAttributes,
		'checked',
		'orientation',
	];

	get checked(): boolean {
		return this.#isDirty ? this.#checked : this.defaultChecked;
	}

	set checked(isChecked: boolean | undefined) {
		this.#isDirty = true;
		this.#checked = isChecked === true;
		this.render();
	}

	get defaultChecked(): boolean {
		return this.hasAttribute('checked');
	}

	set defaultChecked(isChecked: boolean) {
		this.reflect('checked', isChecked);
	}

	// fallow-ignore-next-line code-duplication -- one accessor pair per reflected attribute
	get orientation(): 'horizontal' | 'vertical' {
		return this.getAttribute('orientation') === 'horizontal' ? 'horizontal' : 'vertical';
	}

	set orientation(direction: 'horizontal' | 'vertical' | undefined) {
		this.reflect('orientation', direction);
	}

	override get value(): string {
		const value = super.value;

		return value === '' && this.#isSwitch() ? 'on' : value;
	}

	override set value(next: string) {
		super.value = next;
	}

	protected readonly group = renderLever();

	readonly #bat = requireChild(this.group, '.sonic-lever-bat', HTMLSpanElement);

	#batPress: BatPress | undefined;

	#checked = false;

	#holding: Hold | undefined;

	#isClickSwallowed = false;

	#isDirty = false;

	readonly #switch = renderSwitch();

	override attributeChangedCallback(name: string): void {
		if (name === 'checked') this.#isDirty = false;
		if (this.isDisabled()) this.#holding?.release();
		super.attributeChangedCallback(name);
	}

	override formResetCallback(): void {
		this.#isDirty = false;
		super.formResetCallback();
	}

	protected override activate(): void {
		if (this.#isSwitch()) this.#switch.click();
		else super.activate();
	}

	protected override chooseByClick(option: HTMLButtonElement): void {
		super.chooseByClick(option);
		if (this.#isMomentary(option)) this.#springBack();
	}

	protected override chooseByKey(option: HTMLButtonElement, event: KeyboardEvent): void {
		if (!this.#isMomentary(option)) {
			super.chooseByKey(option, event);
			return;
		}
		if (event.repeat) return;

		this.#hold(option, event.key);
		option.focus();
	}

	protected override claimPress(option: HTMLButtonElement, event: PointerEvent): boolean {
		if (this.#grabBat(event)) return true;
		if (!this.#isMomentary(option)) return false;

		this.group.setPointerCapture(event.pointerId);
		this.#hold(option, event.pointerId);

		return true;
	}

	protected override connect(signal: AbortSignal): void {
		const group = this.group;

		this.upgradeProperties('defaultChecked', 'checked', 'orientation');
		super.connect(signal);
		this.checkStyles(group, 'lever.css');

		this.#switch.addEventListener(
			'click',
			() => {
				if (this.#isClickSwallowed) this.#isClickSwallowed = false;
				else this.#setChecked(!this.checked);
			},
			{ signal },
		);
		this.#switch.addEventListener(
			'pointerdown',
			(event) => {
				if (event.button === 0 && !this.isDisabled()) this.#grabBat(event);
			},
			{ signal },
		);
		this.#bindBat(group, signal);

		this.#holding = bindHold(
			group,
			{
				canHold: () => !this.isDisabled(),
				leave: 'focusout',
				onHold: () => {
					this.toggleState('held', true);
				},
				onRelease: () => {
					this.toggleState('held', false);
					this.#springBack();
				},
			},
			signal,
		);
	}

	protected override focusTarget(): HTMLElement | undefined {
		return this.#isSwitch() ? this.#switch : super.focusTarget();
	}

	protected override isWrapping(): boolean {
		return false;
	}

	protected override releaseTarget(option: HTMLButtonElement): HTMLButtonElement | undefined {
		if (this.#isMomentary(option)) return undefined;

		const options = this.options();
		if (options.length === 2 && optionValue(option) === this.value) {
			return options.find((other) => other !== option);
		}

		return option;
	}

	protected override render(): void {
		const group = this.group;
		const options = this.options();

		if (options.length > 0) {
			this.#switch.remove();
			writeAttribute(group, 'role', 'radiogroup');
			group.dataset.sonicPositions = String(options.length);
			super.render();
			this.#renderThrow(this.#checkedIndex(options));
			return;
		}

		const toggle = this.#switch;
		const isChecked = this.checked;

		writeAttribute(group, 'role', undefined);
		delete group.dataset.sonicPositions;
		if (toggle.parentElement !== group) group.append(toggle);
		toggle.disabled = this.isDisabled();
		toggle.setAttribute('aria-checked', String(isChecked));
		this.forwardNaming(group, false);
		this.forwardNaming(toggle, true);
		const onSide = this.orientation === 'horizontal' ? 1 : -1;

		group.style.setProperty('--_sonic-lever-at', String(isChecked ? onSide : -onSide));
		// eslint-disable-next-line unicorn/no-null -- `null` submits nothing
		this.writeFormValue(isChecked ? this.value : null, String(isChecked));
	}

	protected renderOption(): HTMLButtonElement {
		return renderPosition();
	}

	protected override restoreState(state: string): void {
		if (this.#isSwitch()) this.checked = state === 'true';
		else super.restoreState(state);
	}

	#along(event: PointerEvent): number {
		return this.orientation === 'horizontal' ? event.clientX : event.clientY;
	}

	#bindBat(group: HTMLElement, signal: AbortSignal): void {
		const drop = (event: PointerEvent): void => {
			if (event.pointerId === this.#batPress?.pointerId) this.#batPress = undefined;
		};

		group.addEventListener(
			'pointermove',
			(event) => {
				const press = this.#batPress;
				if (press?.pointerId !== event.pointerId) return;

				const delta = this.#along(event) - press.last;
				if (Math.abs(delta) < this.#bat.getBoundingClientRect().width / 4) return;

				press.hasMoved = true;
				press.last = this.#along(event);
				this.#throwBy(Math.sign(delta), event.pointerId);
			},
			{ signal },
		);
		group.addEventListener(
			'pointerup',
			(event) => {
				const press = this.#batPress;
				if (press?.pointerId !== event.pointerId) return;

				this.#batPress = undefined;
				if (!press.hasMoved && !this.isDisabled()) this.#pressBat(event);
				this.#isClickSwallowed = true;
				setTimeout(() => {
					this.#isClickSwallowed = false;
				}, 0);
			},
			{ signal },
		);
		group.addEventListener('pointercancel', drop, { signal });
		group.addEventListener('lostpointercapture', drop, { signal });
	}

	#checkedIndex(options: Array<HTMLButtonElement>): number {
		return options.findIndex((option) => optionValue(option) === this.value);
	}

	#grabBat(event: PointerEvent): boolean {
		if (!isUnder(this.#bat, event.clientX, event.clientY)) return false;

		this.group.setPointerCapture(event.pointerId);
		this.#batPress = { hasMoved: false, last: this.#along(event), pointerId: event.pointerId };

		return true;
	}

	#hasSprungFrom(option: HTMLButtonElement | undefined): boolean {
		if (!option || !this.#isMomentary(option)) return false;

		this.#holding?.release();

		return this.value !== optionValue(option);
	}

	#hold(option: HTMLButtonElement, by: number | string): void {
		if (this.#holding?.hold(by) === true) this.select(option);
	}

	#isMomentary(option: HTMLButtonElement): boolean {
		const options = this.options();
		const isEnd = option === options[0] || option === options.at(-1);

		return (
			isEnd &&
			options.length > 1 &&
			option.querySelector('[data-sonic-value]')?.hasAttribute('data-sonic-momentary') === true
		);
	}

	#isSwitch(): boolean {
		return this.options().length === 0;
	}

	#pressBat(event: PointerEvent): void {
		const options = this.options();
		if (options.length === 0) {
			this.#setChecked(!this.checked);
			return;
		}

		const box = this.#bat.getBoundingClientRect();
		const [start, size] =
			this.orientation === 'horizontal' ? [box.left, box.width] : [box.top, box.height];
		const offset = (this.#along(event) - start) / size - 0.5;
		const option = options[pressedIndex(this.#checkedIndex(options), options.length, offset)];
		if (!option) return;

		this.chooseByClick(option);
		this.#refocus(options);
	}

	#refocus(options: Array<HTMLButtonElement>): void {
		if (this.group.matches(':focus-within')) options[this.#checkedIndex(options)]?.focus();
	}

	#renderThrow(index: number): void {
		const count = this.options().length;
		const at = index < 0 || count < 2 ? 0 : (2 * index) / (count - 1) - 1;

		this.group.style.setProperty('--_sonic-lever-at', String(at));
	}

	#setChecked(isChecked: boolean): void {
		if (isChecked === this.checked) return;

		this.checked = isChecked;
		this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	#springBack(): void {
		const options = this.options();
		const index = this.#checkedIndex(options);
		const held = options[index];
		if (!held || !this.#isMomentary(held)) return;

		const rest = options[index === 0 ? 1 : index - 1];
		if (!rest) return;

		const isFocused = this.group.contains(this.ownerDocument.activeElement);

		this.select(rest);
		if (isFocused) rest.focus();
	}

	#throwBy(direction: number, pointerId: number): void {
		const options = this.options();
		if (options.length === 0) {
			this.#setChecked(direction === (this.orientation === 'horizontal' ? 1 : -1));
			return;
		}

		const index = this.#checkedIndex(options);
		const option = options[clamp(index + direction, 0, options.length - 1)];
		if (!option || option === options[index] || this.#hasSprungFrom(options[index])) return;

		if (this.#isMomentary(option)) this.#hold(option, pointerId);
		else this.select(option);
		this.#refocus(options);
	}
}
