import type { Hold } from '#lib/hold.ts';

import { optionValue, SonicRadioGroupElement } from '#elements/radio-group.ts';
import { bindHold } from '#lib/hold.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

type Orientation = 'horizontal' | 'vertical';

export abstract class SonicPositionGroupElement extends SonicRadioGroupElement {
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

	get orientation(): Orientation {
		const orientation = this.getAttribute('orientation');

		return orientation === 'horizontal' || orientation === 'vertical'
			? orientation
			: this.defaultOrientation;
	}

	set orientation(direction: Orientation | undefined) {
		this.reflect('orientation', direction);
	}

	override get value(): string {
		const value = super.value;

		return value === '' && this.isBare() ? 'on' : value;
	}

	override set value(next: string) {
		super.value = next;
	}

	protected abstract readonly bare: HTMLButtonElement;

	protected abstract readonly defaultOrientation: Orientation;

	#checked = false;

	#holding: Hold | undefined;

	#isDirty = false;

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
		if (this.isBare()) this.bare.click();
		else super.activate();
	}

	protected along(event: PointerEvent): number {
		return this.orientation === 'vertical' ? event.clientY : event.clientX;
	}

	protected checkedIndex(options: Array<HTMLButtonElement>): number {
		return options.findIndex((option) => optionValue(option) === this.value);
	}

	protected override chooseByClick(option: HTMLButtonElement): void {
		super.chooseByClick(option);
		if (this.isMomentary(option)) this.springBack();
	}

	protected override chooseByKey(option: HTMLButtonElement, event: KeyboardEvent): void {
		if (!this.isMomentary(option)) {
			super.chooseByKey(option, event);
			return;
		}
		if (event.repeat) return;

		this.hold(option, event.key);
		option.focus();
	}

	protected override connect(signal: AbortSignal): void {
		this.upgradeProperties('defaultChecked', 'checked', 'orientation');
		super.connect(signal);
		this.#holding = bindHold(
			this.group,
			{
				canHold: () => !this.isDisabled(),
				leave: 'focusout',
				onHold: () => {
					this.toggleState('held', true);
				},
				onRelease: () => {
					this.toggleState('held', false);
					this.springBack();
				},
			},
			signal,
		);
	}

	protected override focusTarget(): HTMLElement | undefined {
		return this.isBare() ? this.bare : super.focusTarget();
	}

	protected hold(option: HTMLButtonElement, by: number | string): void {
		if (this.#holding?.hold(by) === true) this.select(option);
	}

	protected isBare(): boolean {
		return this.options().length === 0;
	}

	protected isMomentary(option: HTMLButtonElement): boolean {
		const options = this.options();
		const isEnd = option === options[0] || option === options.at(-1);

		return (
			isEnd &&
			options.length > 1 &&
			option.querySelector('[data-sonic-value]')?.hasAttribute('data-sonic-momentary') === true
		);
	}

	protected override isWrapping(): boolean {
		return false;
	}

	protected pressTarget(option: HTMLButtonElement): HTMLButtonElement {
		const options = this.options();
		const index = this.checkedIndex(options);
		const other = options.length === 2 && index >= 0 ? options[1 - index] : undefined;

		return other ?? option;
	}

	protected releaseHold(): void {
		this.#holding?.release();
	}

	protected override render(): void {
		if (!this.isBound()) return;

		const group = this.group;
		const count = this.options().length;

		if (count === 0) {
			this.#renderBare();
			return;
		}

		this.bare.remove();
		writeAttribute(group, 'role', 'radiogroup');
		writeAttribute(group, 'data-sonic-position-count', String(count));
		super.render();
	}

	protected override restoreState(state: string): void {
		if (this.isBare()) this.checked = state === 'true';
		else super.restoreState(state);
	}

	protected setChecked(isChecked: boolean): void {
		if (isChecked === this.checked) return;

		this.checked = isChecked;
		this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	protected springBack(): void {
		const options = this.options();
		const index = this.checkedIndex(options);
		const held = options[index];
		if (!held || !this.isMomentary(held)) return;

		const rest = options[index === 0 ? 1 : index - 1];
		if (!rest) return;

		const isFocused = this.group.contains(this.ownerDocument.activeElement);

		this.select(rest);
		if (isFocused) rest.focus();
	}

	#renderBare(): void {
		const group = this.group;
		const bare = this.bare;
		const isChecked = this.checked;

		writeAttribute(group, 'role', undefined);
		writeAttribute(group, 'data-sonic-position-count', undefined);
		if (bare.parentElement !== group) group.append(bare);
		writeAttribute(bare, 'disabled', this.isDisabled() ? '' : undefined);
		writeAttribute(bare, 'aria-checked', String(isChecked));
		this.forwardNaming(group, false);
		this.forwardNaming(bare, true);
		// eslint-disable-next-line unicorn/no-null -- `null` submits nothing
		this.writeFormValue(isChecked ? this.value : null, String(isChecked));
	}
}
