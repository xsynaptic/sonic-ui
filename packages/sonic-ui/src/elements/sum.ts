import type { RangeLink } from '#elements/range-element.ts';
import type { SumMember, SumMode } from '#lib/distribute.ts';
import type { RangeScale } from '#lib/range-scale.ts';

import { linkRange, SonicRangeElement } from '#elements/range-element.ts';
import { SonicElement } from '#elements/sonic-element.ts';
import { distribute, sumLimits } from '#lib/distribute.ts';

// eslint-disable-next-line unicorn/consistent-boolean-name -- the name bundlers and other kits use
declare const __DEV__: boolean;

declare global {
	interface HTMLElementTagNameMap {
		'sonic-sum': SonicSum;
	}
}

interface Member {
	element: SonicRangeElement;
	link: RangeLink;
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

function isMode(name: null | string): name is SumMode {
	return name !== null && modeNames.has(name);
}

function isLocked(member: Member): boolean {
	return 'sonicLocked' in member.element.dataset || member.link.isDisabled();
}

function gridLimits(scale: RangeScale, [low, high]: [number, number]): [number, number] {
	const bottom = scale.snap(low);
	const top = scale.snap(high);

	return [
		bottom < low - gridSlop ? (scale.keyTarget('ArrowRight', bottom) ?? bottom) : bottom,
		top > high + gridSlop ? (scale.keyTarget('ArrowLeft', top) ?? top) : top,
	];
}

function modelOf(member: Member, value: number, isFree: boolean): SumMember {
	const scale = member.link.scale();
	const [first, last] = scale.bounds;

	return {
		isFree,
		max: Math.max(first, last),
		min: Math.min(first, last),
		snap: scale.snap,
		stepFrom: (from, direction) =>
			scale.keyTarget(direction > 0 ? 'ArrowRight' : 'ArrowLeft', from) ?? from,
		value,
	};
}

export class SonicSum extends SonicElement {
	static override readonly observedAttributes = [
		...SonicElement.observedAttributes,
		'mode',
		'total',
	];

	get mode(): SumMode {
		const name = this.getAttribute('mode');

		return isMode(name) ? name : 'proportional';
	}

	set mode(name: SumMode | undefined) {
		this.reflect('mode', name);
	}

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
			if (mover.link.value() !== mover.seen) this.#move(mover);
		}
	}

	#find(): Array<SonicRangeElement> {
		const found: Array<SonicRangeElement> = [];

		for (const element of this.querySelectorAll('*')) {
			if (element.closest('sonic-sum') !== this) continue;
			if (element instanceof SonicRangeElement) found.push(element);
			else this.#waitFor(element.localName);
		}

		return found;
	}

	#isSameMembers(elements: Array<SonicRangeElement>): boolean {
		return (
			elements.length === this.#members.length &&
			elements.every((element, index) => this.#members[index]?.element === element)
		);
	}

	#join(element: SonicRangeElement): Member {
		const link = linkRange(element);
		const unwatch = link.watch(() => {
			if (this.#isWriting || this.#isQueued) return;

			this.#isQueued = true;
			queueMicrotask(() => {
				if (this.#isQueued) this.#compensate();
			});
		});

		return { element, link, seen: link.value(), unwatch };
	}

	#limit(): void {
		const values = this.#members.map(({ seen }) => seen);

		for (const [index, member] of this.#members.entries()) {
			const model = this.#model(values, member);
			const value = values[index] ?? member.seen;

			member.link.limit(
				isLocked(member)
					? [value, value]
					: gridLimits(member.link.scale(), sumLimits(model, index, this.#total)),
			);
		}
	}

	#model(values: Array<number>, mover?: Member): Array<SumMember> {
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
				{ index, target: mover.link.value() },
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
				member !== snapshot.mover && member.link.value() !== snapshot.values[index],
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

	#spread(values: Array<number>, known: Set<SonicRangeElement>): void {
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
			link.limit(undefined);
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
			`<sonic-sum> cannot reach its total of ${String(this.#total)}; its members span ${String(low)} to ${String(high)}`,
		);
	}

	#write(values: Array<number>, mover?: Member): void {
		this.#isWriting = true;
		try {
			for (const [index, member] of this.#members.entries()) {
				const value = values[index];
				if (value === undefined || value === member.link.value()) continue;

				member.link.limit(undefined);
				member.link.input(value, member === mover);
			}
		} finally {
			this.#isWriting = false;
		}
		for (const member of this.#members) member.seen = member.link.value();
	}
}
