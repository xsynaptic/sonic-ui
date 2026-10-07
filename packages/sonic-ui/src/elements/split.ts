import type { ValueLink } from '#elements/value-element.ts';
import type { SplitMember, SplitMode } from '#lib/distribute.ts';
import type { ValueMapping } from '#lib/value-mapping.ts';

import { SonicElement } from '#elements/sonic-element.ts';
import { linkValue, SonicValueElement } from '#elements/value-element.ts';
import { distribute, splitLimits } from '#lib/distribute.ts';

declare const __DEV__: boolean;

declare global {
	interface HTMLElementTagNameMap {
		'sonic-split': SonicSplit;
	}
}

interface Member {
	element: SonicValueElement;
	link: ValueLink;
	seen: number;
	unwatch: () => void;
}

interface Snapshot {
	mover: Member;
	values: Array<number>;
}

const modeNames = new Set<string>(['cascade', 'equal', 'proportional']);

const gridSlop = 1e-9;

const lockAttributes = ['data-sonic-locked', 'disabled'];

function isMode(name: null | string): name is SplitMode {
	return name !== null && modeNames.has(name);
}

function isLocked(member: Member): boolean {
	return 'sonicLocked' in member.element.dataset || member.link.isDisabled();
}

function gridLimits(mapping: ValueMapping, [low, high]: [number, number]): [number, number] {
	const bottom = mapping.snap(low);
	const top = mapping.snap(high);

	return [
		bottom < low - gridSlop ? (mapping.keyTarget('ArrowRight', bottom) ?? bottom) : bottom,
		top > high + gridSlop ? (mapping.keyTarget('ArrowLeft', top) ?? top) : top,
	];
}

function modelOf(member: Member, value: number, isFree: boolean): SplitMember {
	const mapping = member.link.model.mapping();
	const [first, last] = mapping.bounds;

	return {
		isFree,
		max: Math.max(first, last),
		min: Math.min(first, last),
		snap: mapping.snap,
		stepFrom: (from, direction) =>
			mapping.keyTarget(direction > 0 ? 'ArrowRight' : 'ArrowLeft', from) ?? from,
		value,
	};
}

export class SonicSplit extends SonicElement {
	static override readonly observedAttributes = [
		...SonicElement.observedAttributes,
		'mode',
		'total',
	];

	get mode(): SplitMode {
		const name = this.getAttribute('mode');

		return isMode(name) ? name : 'proportional';
	}

	set mode(name: SplitMode | undefined) {
		this.reflect('mode', name);
	}

	/** What the members add up to; unset, it is their sum when they connect */
	get total(): number | undefined {
		return this.optionalNumberAttribute('total');
	}

	set total(value: number | undefined) {
		this.reflect('total', value);
	}

	#isQueued = false;

	#isTotalKept = false;

	#isWarned = false;

	#isWriting = false;

	#members: Array<Member> = [];

	#signal: AbortSignal | undefined;

	#snapshot: Snapshot | undefined;

	#total = 0;

	readonly #waiting = new Set<string>();

	attributeChangedCallback(name: string): void {
		if ((name === 'mode' || name === 'total') && this.#signal) this.#bind();
		if (name === 'disabled' && this.#signal) this.#limit();
	}

	override connectedCallback(): void {
		this.upgradeProperties('mode', 'total');
		super.connectedCallback();
	}

	protected connect(signal: AbortSignal): void {
		const observer = new MutationObserver((records) => {
			const isLockChange = records.some(
				(record) => record.attributeName !== null && lockAttributes.includes(record.attributeName),
			);

			if (isLockChange || !this.#isSameMembers(this.#find())) this.#bind();
		});

		this.#signal = signal;
		if (this.internals) this.internals.role = 'group';
		observer.observe(this, {
			attributeFilter: lockAttributes,
			attributes: true,
			childList: true,
			subtree: true,
		});
		this.addEventListener(
			'change',
			(event) => {
				this.#release(event);
			},
			{ signal },
		);
		signal.addEventListener(
			'abort',
			() => {
				observer.disconnect();
				this.#signal = undefined;
				this.#isTotalKept = false;
				this.#unbind();
			},
			{ once: true },
		);
		this.#bind();
	}

	#bind(): void {
		const known = new Set(this.#members.map(({ element }) => element));

		this.#unbind();
		this.#members = this.#find().map((element) => this.#join(element));

		const values = this.#members.map(({ seen }) => seen);
		const sum = values.reduce((total, value) => total + value, 0);

		this.#total = this.total ?? (this.#isTotalKept ? this.#total : sum);
		this.#isTotalKept = this.#members.length > 0;
		if (this.#members.length > 0 && sum !== this.#total) {
			this.#spread(values, known);
		}
		this.#limit();
		this.#warnReach();
	}

	#compensate(): void {
		this.#isQueued = false;
		for (const mover of this.#members) {
			if (mover.link.model.value !== mover.seen) this.#move(mover);
		}
	}

	#find(): Array<SonicValueElement> {
		const found: Array<SonicValueElement> = [];

		for (const element of this.querySelectorAll('*')) {
			if (element.closest('sonic-split') !== this) continue;
			if (element instanceof SonicValueElement) found.push(element);
			else this.#waitFor(element.localName);
		}

		return found;
	}

	#isSameMembers(elements: Array<SonicValueElement>): boolean {
		return (
			elements.length === this.#members.length &&
			elements.every((element, index) => this.#members[index]?.element === element)
		);
	}

	#join(element: SonicValueElement): Member {
		const link = linkValue(element);
		const unwatch = link.model.watch(() => {
			if (this.#isWriting || this.#isQueued) return;

			this.#isQueued = true;
			queueMicrotask(() => {
				if (this.#isQueued) this.#compensate();
			});
		});

		link.model.setLanding((target, direction) => this.#land(element, target, direction));

		return { element, link, seen: link.model.value, unwatch };
	}

	#land(element: SonicValueElement, target: number, direction: -1 | 0 | 1): number {
		if (this.#isQueued) this.#compensate();

		const index = this.#members.findIndex((member) => member.element === element);
		const mover = this.#members[index];
		if (!mover) return target;

		const values = distribute(
			this.#model(
				this.#members.map(({ seen }) => seen),
				mover,
			),
			{ mode: this.mode, total: this.#total },
			{ direction, index, target },
		);

		return values[index] ?? target;
	}

	#limit(): void {
		const isFrozen = this.isDisabled();
		const values = this.#members.map(({ seen }) => seen);

		for (const [index, member] of this.#members.entries()) {
			const model = this.#model(values, member);
			const value = values[index] ?? member.seen;

			member.link.model.setLimit(
				isFrozen || isLocked(member)
					? [value, value]
					: gridLimits(member.link.model.mapping(), splitLimits(model, index, this.#total)),
			);
		}
	}

	#model(values: Array<number>, mover?: Member): Array<SplitMember> {
		return this.#members.map((member, index) => {
			const isFixed = member !== mover && (isLocked(member) || member.link.isHeld());

			return modelOf(member, values[index] ?? member.seen, !isFixed);
		});
	}

	#move(mover: Member): void {
		const index = this.#members.indexOf(mover);
		const kept = this.#snapshot;
		const snapshot =
			kept?.mover === mover && mover.link.isHeld()
				? kept
				: { mover, values: this.#members.map(({ seen }) => seen) };

		this.#snapshot = snapshot;
		this.#write(
			distribute(
				this.#model(snapshot.values, mover),
				{ mode: this.mode, total: this.#total },
				{ index, target: mover.link.model.value },
			),
			mover,
		);
		this.#limit();
	}

	#release(event: Event): void {
		if (this.#isWriting) return;
		if (this.#isQueued) this.#compensate();

		const snapshot = this.#snapshot;
		if (snapshot?.mover.element !== event.target) return;

		this.#snapshot = undefined;

		const changed = this.#members.filter(
			(member, index) =>
				member !== snapshot.mover && member.link.model.value !== snapshot.values[index],
		);

		queueMicrotask(() => {
			this.#isWriting = true;
			try {
				for (const { element } of changed) {
					element.dispatchEvent(new Event('change', { bubbles: true }));
				}
			} finally {
				this.#isWriting = false;
			}
		});
	}

	#spread(values: Array<number>, known: Set<SonicValueElement>): void {
		const model = this.#model(values);
		const joined = this.#members.map(({ element }) => known.size > 0 && !known.has(element));
		const isAnyKnownFree = model.some((member, index) => member.isFree && joined[index] !== true);
		const spreadOver = model.map((member, index) =>
			isAnyKnownFree && joined[index] === true ? { ...member, isFree: false } : member,
		);

		this.#write(distribute(spreadOver, { mode: this.mode, total: this.#total }));
	}

	#unbind(): void {
		for (const { link, unwatch } of this.#members) {
			unwatch();
			link.model.setLanding(undefined);
			link.model.setLimit(undefined);
		}
		this.#members = [];
		this.#snapshot = undefined;
		this.#isQueued = false;
	}

	#waitFor(tag: string): void {
		if (!tag.includes('-') || customElements.get(tag) || this.#waiting.has(tag)) return;

		this.#waiting.add(tag);
		void customElements.whenDefined(tag).then(() => {
			this.#waiting.delete(tag);
			if (this.#signal) this.#bind();
		});
	}

	#warnReach(): void {
		if (!__DEV__) return;
		if (this.#isWarned || this.#members.length === 0) return;

		const models = this.#model(this.#members.map(({ seen }) => seen));
		const low = models.reduce((total, { min }) => total + min, 0);
		const high = models.reduce((total, { max }) => total + max, 0);
		if (this.#total >= low && this.#total <= high) return;

		this.#isWarned = true;
		console.warn(
			`<sonic-split> cannot reach its total of ${String(this.#total)}; its members reach from ${String(low)} to ${String(high)}`,
		);
	}

	#write(values: Array<number>, mover?: Member): void {
		this.#isWriting = true;
		try {
			for (const [index, member] of this.#members.entries()) {
				const value = values[index];
				if (value === undefined || value === member.link.model.value) continue;

				member.link.model.setLimit(undefined);
				member.link.input(value, member === mover);
			}
		} finally {
			this.#isWriting = false;
		}
		for (const member of this.#members) member.seen = member.link.model.value;
	}
}
