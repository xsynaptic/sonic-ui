import type { RegionSpan } from '#lib/region-drag.ts';
import type { Seconds } from '#lib/units.ts';

import { SonicFormElement } from '#elements/form-element.ts';

declare const __DEV__: boolean;

declare global {
	interface HTMLElementTagNameMap {
		'sonic-region': SonicRegion;
	}
}

type RegionHold = 'keys' | 'pointer';

export interface RegionLink {
	change: () => void;
	draw: (part: HTMLElement) => void;
	hold: (by: RegionHold | undefined) => void;
	input: (span: RegionSpan) => boolean;
	isDisabled: () => boolean;
	span: () => RegionSpan;
}

const owners = new WeakMap<Element, (region: SonicRegion) => void>();

const warned = new Set<string>();

// Filled from inside the class, so it reaches protected members and nothing lands on the element's public type
let link: (element: SonicRegion) => RegionLink;

export function linkRegion(element: SonicRegion): RegionLink {
	return link(element);
}

export function ownRegions(
	host: Element,
	changed: (region: SonicRegion) => void,
	signal: AbortSignal,
): void {
	owners.set(host, changed);
	signal.addEventListener(
		'abort',
		() => {
			if (owners.get(host) === changed) owners.delete(host);
		},
		{ once: true },
	);
}

function warnOnce(key: string, message: string): void {
	if (!__DEV__ || warned.has(key)) return;

	warned.add(key);
	console.warn(message);
}

export class SonicRegion extends SonicFormElement {
	static override readonly observedAttributes = [
		...SonicFormElement.observedAttributes,
		'end',
		'kind',
		'name',
		'start',
		'tabindex',
	];

	static {
		link = (element) => ({
			change: () => {
				element.#report('change');
			},
			draw: (part) => {
				element.#draw(part);
			},
			hold: (by) => {
				element.#held = by;
				element.toggleState('dragging', by === 'pointer');
			},
			input: (span) => element.#input(span),
			isDisabled: () => element.isDisabled(),
			span: () => {
				const { end, start } = element.#span;

				return { end: Math.max(start, end), start: Math.min(start, end) };
			},
		});
	}

	get dragging(): boolean {
		return this.hasState('dragging');
	}

	get end(): Seconds {
		return this.#span.end;
	}

	set end(next: null | Seconds | undefined) {
		if (!this.#held) this.reflect('end', next);
	}

	/** Lowercase letters, digits and hyphens; colours the region through `--sonic-marker-<kind>` */
	get kind(): string | undefined {
		return this.getAttribute('kind') ?? undefined;
	}

	set kind(kind: string | undefined) {
		this.reflect('kind', kind);
	}

	get start(): Seconds {
		return this.#span.start;
	}

	set start(next: null | Seconds | undefined) {
		if (!this.#held) this.reflect('start', next);
	}

	#formState = '';

	// A held region owns its values, so a host writing them on every `timeupdate` does not fight the gesture
	#held: RegionHold | undefined;

	#part: HTMLElement | undefined;

	#span: RegionSpan = { end: 0, start: 0 };

	attributeChangedCallback(name: string): void {
		const isSpan = name === 'end' || name === 'start';

		if (isSpan && this.#held) return;
		if (isSpan) this.#readSpan(name);
		this.render();
	}

	override connectedCallback(): void {
		this.upgradeProperties('end', 'kind', 'start');
		super.connectedCallback();
	}

	override formResetCallback(): void {
		if (this.#held) return;

		this.#readSpan('start');
		this.#readSpan('end');
		this.render();
	}

	protected connect(): void {
		this.render();
		if (this.parentElement?.localName !== 'sonic-wavestrip') {
			warnOnce(
				'parent',
				'<sonic-region> draws nothing of its own, so it shows only as a child of <sonic-wavestrip>',
			);
		}
	}

	protected override focusTarget(): HTMLElement | undefined {
		return this.#part;
	}

	protected render(): void {
		if (!this.isBound() || !this.parentElement) return;

		owners.get(this.parentElement)?.(this);
	}

	protected restoreState(state: string): void {
		const [start = NaN, end = NaN] = state.split(',').map(Number);
		if (!Number.isFinite(start) || !Number.isFinite(end)) return;

		this.#span = { end, start };
		this.render();
	}

	protected override stateTarget(): HTMLElement | undefined {
		return this.#part;
	}

	#draw(part: HTMLElement): void {
		this.#part = part;
		this.forwardNaming(part, true);
		this.#writeForm();
		if (
			__DEV__ &&
			!this.hasAttribute('aria-label') &&
			!this.hasAttribute('aria-labelledby') &&
			this.namingLabels().length === 0
		) {
			warnOnce(
				'name',
				'<sonic-region> is a slider with no name; give it an aria-label or aria-labelledby',
			);
		}
	}

	#input(span: RegionSpan): boolean {
		const hasMoved = span.start !== this.#span.start || span.end !== this.#span.end;

		if (hasMoved) {
			this.#span = span;
			this.render();
			this.#report('input');
		}

		return hasMoved;
	}

	// One end at a time, so a write to one leaves the other where a gesture put it
	#readSpan(name: 'end' | 'start'): void {
		const { end, start } = this.#span;

		if (name === 'end') {
			this.#span = { end: this.numberAttribute('end', start), start };
			return;
		}

		const next = this.numberAttribute('start', 0);

		this.#span = { end: this.hasAttribute('end') ? end : next, start: next };
	}

	#report(type: 'change' | 'input'): void {
		this.dispatchEvent(new Event(type, { bubbles: true, composed: type === 'input' }));
	}

	#writeForm(): void {
		const { end, start } = this.#span;
		const state = `${String(start)},${String(end)}`;
		const formState = `${this.name}=${state}`;
		if (formState === this.#formState) return;

		this.#formState = formState;
		this.writeFormFields(
			[
				['start', start],
				['end', end],
			],
			state,
		);
	}
}
