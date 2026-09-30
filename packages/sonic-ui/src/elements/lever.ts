import { optionValue, SonicRadioGroupElement } from '#elements/radio-group.ts';
import { bindHoldRelease } from '#lib/hold.ts';
import { template } from '#lib/render.ts';
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

	// fallow-ignore-next-line code-duplication -- one accessor pair per reflected attribute, as on a native element
	get orientation(): 'horizontal' | 'vertical' {
		return this.getAttribute('orientation') === 'horizontal' ? 'horizontal' : 'vertical';
	}

	set orientation(direction: 'horizontal' | 'vertical' | undefined) {
		this.reflect('orientation', direction);
	}

	// Unset reads `on` in switch mode, as on a checkbox
	override get value(): string {
		const value = super.value;

		return value === '' && this.#isSwitch() ? 'on' : value;
	}

	override set value(next: string) {
		super.value = next;
	}

	protected readonly group = renderLever();

	#checked = false;

	#holder: number | string | undefined;

	#isDirty = false;

	readonly #switch = renderSwitch();

	override attributeChangedCallback(name: string): void {
		if (name === 'checked') this.#isDirty = false;
		if (this.isDisabled()) this.#release();
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

	// A click with no pointer, as from assistive technology, has no release to wait for
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
				this.checked = !this.checked;
				this.dispatchEvent(new Event('change', { bubbles: true }));
			},
			{ signal },
		);

		bindHoldRelease(
			group,
			{
				holder: () => this.#holder,
				release: () => {
					this.#release();
				},
			},
			signal,
		);
		// Focus moves onto the held position, so only focus leaving the lever releases it
		group.addEventListener(
			'focusout',
			(event) => {
				const next = event.relatedTarget;
				const isLeaving = !(next instanceof Node && group.contains(next));

				if (isLeaving && typeof this.#holder === 'string') this.#release();
			},
			{ signal },
		);
		signal.addEventListener(
			'abort',
			() => {
				this.#release();
			},
			{ once: true },
		);
	}

	protected override focusTarget(): HTMLElement | undefined {
		return this.#isSwitch() ? this.#switch : super.focusTarget();
	}

	// A press on either side of a two-position lever flips it, as flicking the bat does
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
			this.#renderThrow(options.findIndex((option) => optionValue(option) === this.value));
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
		// On points up, or toward the end when horizontal, as on hardware
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

	protected override wraps(): boolean {
		return false;
	}

	#hold(option: HTMLButtonElement, holder: number | string): void {
		if (this.isDisabled() || this.#holder !== undefined) return;

		this.#holder = holder;
		this.toggleState('held', true);
		this.select(option);
	}

	// Only an end position springs; a bat cannot spring back to both sides
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

	#release(): void {
		if (this.#holder === undefined) return;

		this.#holder = undefined;
		this.toggleState('held', false);
		this.#springBack();
	}

	#renderThrow(index: number): void {
		const count = this.options().length;
		const at = index < 0 || count < 2 ? 0 : (2 * index) / (count - 1) - 1;

		this.group.style.setProperty('--_sonic-lever-at', String(at));
	}

	#springBack(): void {
		const options = this.options();
		const index = options.findIndex((option) => optionValue(option) === this.value);
		const held = options[index];
		if (!held || !this.#isMomentary(held)) return;

		const rest = options[index === 0 ? 1 : index - 1];
		if (!rest) return;

		const isFocused = this.group.contains(this.ownerDocument.activeElement);

		this.select(rest);
		if (isFocused) rest.focus();
	}
}
