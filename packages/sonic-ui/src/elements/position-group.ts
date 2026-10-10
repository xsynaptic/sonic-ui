import type { Hold } from '#lib/hold.ts';
import type { Position } from '#lib/positions.ts';

import { optionValue, SonicRadioGroupElement } from '#elements/radio-group.ts';
import { bindHold } from '#lib/hold.ts';
import { isMomentaryAt, pressTarget, restOf } from '#lib/positions.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

type Orientation = 'horizontal' | 'vertical';

const latching: Position = { isDisabled: false, isMomentary: false };

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

	protected checkedIndex(): number {
		if (this.isBare()) return this.checked ? this.onIndex() : 1 - this.onIndex();

		return this.options().findIndex((option) => optionValue(option) === this.value);
	}

	protected override chooseByClick(index: number): void {
		super.chooseByClick(index);
		if (this.isMomentary(index)) this.springBack();
	}

	protected override chooseByKey(index: number, event: KeyboardEvent): void {
		if (!this.isMomentary(index)) {
			super.chooseByKey(index, event);
			return;
		}
		if (event.repeat) return;

		this.hold(index, event.key);
		this.options()[index]?.focus();
	}

	protected override connect(signal: AbortSignal): void {
		this.upgradeProperties('defaultChecked', 'checked', 'orientation');
		super.connect(signal);
		this.#holding = bindHold(
			this.control,
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

	protected hold(index: number, by: number | string): void {
		if (this.#holding?.hold(by) === true) this.select(index);
	}

	protected isBare(): boolean {
		return this.options().length === 0;
	}

	// A row may repeat a value, and every position that holds it is checked
	protected isChecked(index: number): boolean {
		const option = this.options()[index];

		return option ? optionValue(option) === this.value : index === this.checkedIndex();
	}

	protected isMomentary(index: number): boolean {
		return isMomentaryAt(this.positions(), index);
	}

	protected override isWrapping(): boolean {
		return false;
	}

	// On is up, as on hardware
	protected onIndex(): number {
		return this.orientation === 'vertical' ? 0 : 1;
	}

	protected override positions(): Array<Position> {
		return this.isBare() ? [latching, latching] : super.positions();
	}

	protected pressedIndex(target: EventTarget | null): number {
		return target === this.bare ? 0 : this.indexOf(target);
	}

	protected pressTarget(index: number): number {
		return pressTarget(this.positions(), this.checkedIndex(), index);
	}

	protected releaseHold(): void {
		this.#holding?.release();
	}

	protected override render(): void {
		if (!this.isBound()) return;

		const group = this.control;
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

	protected override select(index: number): void {
		if (this.isBare()) this.setChecked(index === this.onIndex());
		else super.select(index);
	}

	protected setChecked(isChecked: boolean): void {
		if (isChecked === this.checked) return;

		this.checked = isChecked;
		this.dispatchEvent(new Event('change', { bubbles: true }));
	}

	protected springBack(): void {
		const rest = restOf(this.positions(), this.checkedIndex());
		if (rest === undefined) return;

		const isFocused = this.control.contains(this.ownerDocument.activeElement);

		this.select(rest);
		if (isFocused) this.options()[rest]?.focus();
	}

	#renderBare(): void {
		const group = this.control;
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
