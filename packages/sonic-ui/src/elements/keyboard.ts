import type { Hold } from '#lib/hold.ts';

import { SonicFormElement } from '#elements/form-element.ts';
import { focusByPointer } from '#lib/focus-by-pointer.ts';
import { bindHold } from '#lib/hold.ts';
import { clamp } from '#lib/math.ts';
import { capturePointer, isInside } from '#lib/pointer-drag.ts';
import { template } from '#lib/render.ts';
import { rovingIndex } from '#lib/roving-grid.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-keyboard': SonicKeyboard;
	}

	interface HTMLElementEventMap {
		'sonic-noteoff': CustomEvent<{ note: number }>;
		'sonic-noteon': CustomEvent<{ note: number }>;
	}
}

const renderKeyboard = template(
	/* HTML */ `<div class="sonic-keyboard" role="group"></div>`,
	HTMLDivElement,
);

const renderOctave = template(
	/* HTML */ `<div class="sonic-keyboard-octave"></div>`,
	HTMLDivElement,
);

const renderKey = template(
	/* HTML */ `
		<button class="sonic-keyboard-key" type="button">
			<span class="sonic-keyboard-cap"></span>
		</button>
	`,
	HTMLButtonElement,
);

const noteNames = [
	'C',
	'C sharp',
	'D',
	'D sharp',
	'E',
	'F',
	'F sharp',
	'G',
	'G sharp',
	'A',
	'A sharp',
	'B',
] as const;

const blackSteps = new Set([1, 3, 6, 8, 10]);

const holdKeys = new Set([' ', 'Enter']);

const litMarks = { lit: '', ok: 'ok' } as const;

const lowestOctave = -1;

const highestOctave = 8;

const tapLength = 250;

type Holder = 'key' | 'tap' | number;

type KeyLight = keyof typeof litMarks | undefined;

type NoteEvent = 'sonic-noteoff' | 'sonic-noteon';

interface Press {
	boxes: Array<[number, DOMRect]>;
	note: number | undefined;
}

interface Shown {
	down: Set<number>;
	isDisabled: boolean;
	lit: Set<number>;
	litOk: Set<number>;
	stop: number;
}

function scientificNote(note: number): string {
	const name = noteNames[note % 12] ?? '';
	const octave = String(Math.floor(note / 12) - 1);

	return name.includes(' ') ? `${name} ${octave}` : `${name}${octave}`;
}

function parseNotes(text: null | string): Array<number> {
	if (text === null) return [];

	return text
		.split(/[\s,]+/)
		.filter(Boolean)
		.map(Number)
		.filter((note) => Number.isSafeInteger(note));
}

function lightOf(note: number, shown: Shown): KeyLight {
	if (shown.litOk.has(note)) return 'ok';
	if (shown.lit.has(note)) return 'lit';

	return undefined;
}

export class SonicKeyboard extends SonicFormElement {
	static override readonly observedAttributes = [
		...SonicFormElement.observedAttributes,
		'held',
		'lit',
		'lit-ok',
		'octave',
		'octaves',
	];

	get formatNote(): ((note: number) => string) | undefined {
		return this.#formatNote;
	}

	set formatNote(format: ((note: number) => string) | undefined) {
		this.#formatNote = format;
		this.render();
	}

	get formatSpokenNote(): ((note: number, light: KeyLight) => string) | undefined {
		return this.#formatSpokenNote;
	}

	set formatSpokenNote(format: ((note: number, light: KeyLight) => string) | undefined) {
		this.#formatSpokenNote = format;
		this.render();
	}

	get held(): Array<number> {
		return parseNotes(this.getAttribute('held'));
	}

	set held(notes: Iterable<number> | undefined) {
		this.reflect('held', notes === undefined ? undefined : [...notes].join(' '));
	}

	get lit(): Array<number> {
		return parseNotes(this.getAttribute('lit'));
	}

	set lit(notes: Iterable<number> | undefined) {
		this.reflect('lit', notes === undefined ? undefined : [...notes].join(' '));
	}

	get litOk(): Array<number> {
		return parseNotes(this.getAttribute('lit-ok'));
	}

	set litOk(notes: Iterable<number> | undefined) {
		this.reflect('lit-ok', notes === undefined ? undefined : [...notes].join(' '));
	}

	get octave(): number {
		return this.#range().octave;
	}

	set octave(octave: number | undefined) {
		this.reflect('octave', octave);
	}

	get octaves(): number {
		return this.#range().octaves;
	}

	set octaves(octaves: number | undefined) {
		this.reflect('octaves', octaves);
	}

	protected override readonly control = renderKeyboard();

	protected override readonly sheet = 'keyboard.css';

	#drawn: undefined | { octave: number; octaves: number };

	#formatNote: ((note: number) => string) | undefined;

	#formatSpokenNote: ((note: number, light: KeyLight) => string) | undefined;

	readonly #holders = new Map<number, Set<Holder>>();

	#keyHeld: number | undefined;

	#keyHold: Hold | undefined;

	readonly #outbox: Array<{ note: number; type: NoteEvent }> = [];

	readonly #presses = new Map<number, Press>();

	#stop: number | undefined;

	readonly #taps = new Map<number, ReturnType<typeof setTimeout>>();

	attributeChangedCallback(name: string): void {
		if (name === 'disabled' && this.isDisabled()) this.#releaseAll();
		if (name === 'octave' || name === 'octaves') this.#releaseAll();
		this.render();
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		queueMicrotask(() => {
			this.#releaseAll();
		});
	}

	protected connect(signal: AbortSignal): void {
		const group = this.control;

		this.upgradeProperties(
			'formatNote',
			'formatSpokenNote',
			'held',
			'lit',
			'litOk',
			'octave',
			'octaves',
		);
		this.keepControl(signal);
		this.render();

		this.#bindPointer(group, signal);
		this.#bindKeys(group, signal);
		this.#bindTap(group, signal);
		signal.addEventListener(
			'abort',
			() => {
				this.#releaseAll();
			},
			{ once: true },
		);
	}

	protected override focusTarget(): HTMLElement | undefined {
		return this.#keys().find((key) => key.tabIndex === 0);
	}

	protected render(): void {
		if (!this.isBound()) return;

		const isRedrawn = this.#drawKeys();
		const shown = {
			down: new Set([...this.held, ...this.#holders.keys()]),
			isDisabled: this.isDisabled(),
			lit: new Set(this.lit),
			litOk: new Set(this.litOk),
			stop: this.#stopNote(),
		};

		for (const key of this.#keys()) this.#renderKey(key, shown);
		this.forwardNaming(this.control, true);
		if (isRedrawn) this.focusTarget()?.focus();
	}

	// eslint-disable-next-line @typescript-eslint/no-empty-function -- submits nothing, so nothing is restored
	protected restoreState(): void {}

	#bindKeys(group: HTMLElement, signal: AbortSignal): void {
		const hold = bindHold(
			group,
			{
				canHold: () => !this.isDisabled(),
				leave: 'focusout',
				onHold: () => {
					if (this.#keyHeld !== undefined) this.#setHeld(this.#keyHeld, 'key', true);
				},
				onRelease: () => {
					const note = this.#keyHeld;

					this.#keyHeld = undefined;
					if (note !== undefined) this.#setHeld(note, 'key', false);
				},
			},
			signal,
		);

		this.#keyHold = hold;
		group.addEventListener(
			'keydown',
			(event) => {
				const key = this.#keyOf(event.target);
				if (!key || event.defaultPrevented) return;

				if (holdKeys.has(event.key)) {
					event.preventDefault();
					this.#holdByKey(hold, key, event);
					return;
				}

				this.#moveFocus(key, event);
			},
			{ signal },
		);
		group.addEventListener(
			'keyup',
			(event) => {
				if (holdKeys.has(event.key) && this.#keyOf(event.target)) event.preventDefault();
			},
			{ signal },
		);
	}

	#bindPointer(group: HTMLElement, signal: AbortSignal): void {
		const end = (event: PointerEvent): void => {
			this.#endPress(event.pointerId);
		};

		group.addEventListener(
			'pointerdown',
			(event) => {
				if (event.button !== 0 || this.isDisabled()) return;

				const key = this.#keyOf(event.target);
				if (!key) return;

				const note = Number(key.dataset.sonicNote);

				this.#endPress(event.pointerId);
				capturePointer(group, event.pointerId);
				this.#presses.set(event.pointerId, { boxes: this.#boxes(), note });
				this.#stop = note;
				this.#setHeld(note, event.pointerId, true);
				focusByPointer(key);
			},
			{ signal },
		);
		group.addEventListener(
			'pointermove',
			(event) => {
				const press = this.#presses.get(event.pointerId);
				if (!press) return;

				const origin = group.getBoundingClientRect();
				const note = press.boxes.find(([, box]) =>
					isInside(box, event.clientX - origin.x, event.clientY - origin.y),
				)?.[0];
				if (note === press.note) return;

				const left = press.note;

				press.note = note;
				if (left !== undefined) this.#setHeld(left, event.pointerId, false);
				if (note !== undefined) this.#setHeld(note, event.pointerId, true);
			},
			{ signal },
		);
		group.addEventListener('pointerup', end, { signal });
		group.addEventListener('pointercancel', end, { signal });
		group.addEventListener('lostpointercapture', end, { signal });
	}

	#bindTap(group: HTMLElement, signal: AbortSignal): void {
		group.addEventListener(
			'click',
			(event) => {
				const key = this.#keyOf(event.target);
				if (!key || event.detail !== 0 || this.isDisabled()) return;

				this.#tap(Number(key.dataset.sonicNote));
			},
			{ signal },
		);
	}

	#boxes(): Array<[number, DOMRect]> {
		const origin = this.control.getBoundingClientRect();
		const keys = this.#keys().map((key) => {
			const box = key.getBoundingClientRect();

			return [
				Number(key.dataset.sonicNote),
				new DOMRect(box.x - origin.x, box.y - origin.y, box.width, box.height),
			] satisfies [number, DOMRect];
		});

		return [
			...keys.filter(([note]) => blackSteps.has(note % 12)),
			...keys.filter(([note]) => !blackSteps.has(note % 12)),
		];
	}

	#dispatchNote(type: NoteEvent, note: number): void {
		this.#outbox.push({ note, type });
		if (this.#outbox.length > 1) return;

		let next = this.#outbox[0];

		while (next) {
			this.dispatchEvent(
				new CustomEvent(next.type, { bubbles: true, composed: true, detail: { note: next.note } }),
			);
			this.#outbox.shift();
			next = this.#outbox[0];
		}
	}

	#drawKeys(): boolean {
		const { octave, octaves } = this.#range();
		if (this.#drawn?.octave === octave && this.#drawn.octaves === octaves) return false;

		const wasFocused = this.control.matches(':focus-within');
		const lowest = 12 * (octave + 1);
		const blocks = Array.from({ length: octaves }, (_block, block) => {
			const keys = Array.from({ length: 12 }, (_key, step) => {
				const key = renderKey();

				key.dataset.sonicNote = String(lowest + 12 * block + step);
				key.dataset.sonicKey = blackSteps.has(step) ? 'black' : 'white';

				return key;
			});
			const octaveBlock = renderOctave();

			octaveBlock.append(...keys);

			return octaveBlock;
		});

		this.#drawn = { octave, octaves };
		this.control.replaceChildren(...blocks);

		return wasFocused;
	}

	#endPress(pointerId: number): void {
		const press = this.#presses.get(pointerId);
		if (!press) return;

		this.#presses.delete(pointerId);
		if (press.note !== undefined) this.#setHeld(press.note, pointerId, false);
	}

	#holdByKey(hold: Hold, key: HTMLButtonElement, event: KeyboardEvent): void {
		if (event.repeat || this.#keyHeld !== undefined) return;

		this.#keyHeld = Number(key.dataset.sonicNote);
		if (!hold.hold(event.key)) this.#keyHeld = undefined;
	}

	#keyOf(target: EventTarget | null): HTMLButtonElement | undefined {
		if (!(target instanceof Element)) return undefined;

		const key = target.closest('.sonic-keyboard-key');

		return key instanceof HTMLButtonElement && this.control.contains(key) ? key : undefined;
	}

	#keys(): Array<HTMLButtonElement> {
		return [...this.control.querySelectorAll<HTMLButtonElement>('.sonic-keyboard-key')];
	}

	#moveFocus(from: HTMLButtonElement, event: KeyboardEvent): void {
		const keys = this.#keys();
		const next =
			keys[rovingIndex(keys.indexOf(from), event.key, { columns: 12, count: keys.length }) ?? -1];
		if (!next) return;

		event.preventDefault();
		this.#stop = Number(next.dataset.sonicNote);
		this.render();
		next.focus();
	}

	#range(): { octave: number; octaves: number } {
		const octaves = clamp(
			Math.round(this.numberAttribute('octaves', 2)),
			1,
			highestOctave - lowestOctave + 1,
		);
		const octave = clamp(
			Math.round(this.numberAttribute('octave', 4)),
			lowestOctave,
			highestOctave - octaves + 1,
		);

		return { octave, octaves };
	}

	#releaseAll(): void {
		this.#keyHold?.release();

		const presses = [...this.#presses];
		const taps = [...this.#taps];

		this.#presses.clear();
		this.#taps.clear();
		for (const [pointerId, press] of presses) {
			if (press.note !== undefined) this.#setHeld(press.note, pointerId, false);
		}
		for (const [note, timer] of taps) {
			clearTimeout(timer);
			this.#setHeld(note, 'tap', false);
		}
	}

	#renderKey(key: HTMLButtonElement, shown: Shown): void {
		const note = Number(key.dataset.sonicNote);
		const light = lightOf(note, shown);
		const name = (this.#formatNote ?? scientificNote)(note);

		writeAttribute(key, 'aria-label', this.#formatSpokenNote?.(note, light) ?? name);
		writeAttribute(key, 'data-sonic-label', note % 12 === 0 ? name : undefined);
		writeAttribute(key, 'data-sonic-lit', light === undefined ? undefined : litMarks[light]);
		writeAttribute(key, 'disabled', shown.isDisabled ? '' : undefined);
		writeAttribute(key, 'tabindex', note === shown.stop ? '0' : '-1');
		key.toggleAttribute('data-sonic-pressed', shown.down.has(note));
	}

	#setHeld(note: number, holder: Holder, isHeld: boolean): void {
		const holders = this.#holders.get(note) ?? new Set<Holder>();
		const wasSounding = holders.size > 0;

		if (isHeld) holders.add(holder);
		else holders.delete(holder);

		const isSounding = holders.size > 0;

		if (isSounding) this.#holders.set(note, holders);
		else this.#holders.delete(note);
		if (isSounding === wasSounding) return;

		this.render();
		this.#dispatchNote(isSounding ? 'sonic-noteon' : 'sonic-noteoff', note);
	}

	#stopNote(): number {
		const { octave, octaves } = this.#range();
		const lowest = 12 * (octave + 1);
		const stop = this.#stop;

		return stop !== undefined && stop >= lowest && stop < lowest + 12 * octaves ? stop : lowest;
	}

	#tap(note: number): void {
		clearTimeout(this.#taps.get(note));
		this.#taps.set(
			note,
			setTimeout(() => {
				this.#taps.delete(note);
				this.#setHeld(note, 'tap', false);
			}, tapLength),
		);
		this.#setHeld(note, 'tap', true);
	}
}
