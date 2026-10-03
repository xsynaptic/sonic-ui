import { expect, test } from 'vitest';

import { linkRange, SonicRangeElement } from '#elements/range-element.ts';

import { pointerAt, pressKey, recordEvents } from './helpers.ts';

class SeamRange extends SonicRangeElement {
	fromPlace: number | undefined;

	readonly held: Array<number> = [];

	readonly #control = Object.assign(document.createElement('div'), {
		innerHTML: '<div popover="manual"><span></span><input hidden /></div>',
	});

	control(): HTMLElement {
		return this.#control;
	}

	protected connect(signal: AbortSignal): void {
		this.appendOnce(this.#control);
		this.render();
		this.bindGestures(this.#control, signal, () => {
			const axis = { position: (event: PointerEvent) => event.clientX, travelPx: 200 };

			return this.fromPlace === undefined ? axis : { ...axis, fromPlace: this.fromPlace };
		});
	}

	protected draw(): void {
		// Nothing drawn beyond the ARIA the base writes
	}

	protected override focusTarget(): HTMLElement {
		return this.#control;
	}

	protected override heldWrite(next: number): void {
		this.held.push(next);
	}
}

customElements.define('seam-range', SeamRange);

function mountRange(attributes: string): SeamRange {
	document.body.innerHTML = `<seam-range ${attributes}></seam-range>`;

	const range = document.querySelector('seam-range');
	if (!(range instanceof SeamRange)) throw new Error('The range did not render');

	return range;
}

test('a value written mid-drag reaches heldWrite and leaves the drag its value', () => {
	const range = mountRange('value="40"');
	const events = recordEvents(document.body);
	const changed: Array<number> = [];

	range.addEventListener('change', () => {
		changed.push(range.value);
	});
	pointerAt(range.control(), 'pointerdown', { clientX: 100 });
	pointerAt(range.control(), 'pointermove', { clientX: 150 });
	range.value = 10;
	range.setAttribute('value', '20');

	expect(range.held).toEqual([10, 20]);
	expect(range.value).toBe(65);

	pointerAt(range.control(), 'pointerup', { clientX: 150 });
	expect(events).toEqual(['input', 'change']);
	expect(changed).toEqual([65]);
});

test('a grab carrying fromPlace starts the drag there rather than at the value', () => {
	const range = mountRange('min="-40" max="40" value="0"');

	range.fromPlace = 0.75;
	pointerAt(range.control(), 'pointerdown', { clientX: 100 });
	pointerAt(range.control(), 'pointermove', { clientX: 150 });

	expect(range.value).toBe(40);
});

test('a link watch hears a scripted write, a range change and a key press, until it lets go', () => {
	const range = mountRange('min="10" max="50" step="5" value="40"');
	const seen: Array<number> = [];
	const link = linkRange(range);
	const unwatch = link.watch(() => {
		seen.push(link.value());
	});

	range.value = 20;
	range.setAttribute('max', '15');
	pressKey(range.control(), 'ArrowDown');
	expect(seen).toEqual([20, 15, 10]);

	unwatch();
	range.value = 15;
	expect(seen).toEqual([20, 15, 10]);
});

test("a link's input reports input and never change, and nothing when the value snaps back", () => {
	const range = mountRange('min="10" max="50" step="5" value="40"');
	const events = recordEvents(document.body);
	const link = linkRange(range);

	expect(link.input(41)).toBe(false);
	expect(events).toEqual([]);

	expect(link.input(33)).toBe(true);
	expect(range.value).toBe(35);
	expect(events).toEqual(['input']);
});

test("a link's input leaves the value alone while the range's own drag holds it", () => {
	const range = mountRange('value="40"');
	const link = linkRange(range);

	pointerAt(range.control(), 'pointerdown', { clientX: 100 });
	pointerAt(range.control(), 'pointermove', { clientX: 150 });

	expect(link.input(10)).toBe(false);
	expect(range.value).toBe(65);

	pointerAt(range.control(), 'pointerup', { clientX: 150 });
	expect(link.input(10)).toBe(true);
});

test('a limit stops a drag and the keys inside it, and leaves the bounds and property writes alone', () => {
	const range = mountRange('min="10" max="110" step="5" value="40"');
	const link = linkRange(range);
	const values: Array<number> = [];

	link.limit([20, 65]);
	pointerAt(range.control(), 'pointerdown', { clientX: 0 });
	for (const clientX of [1000, -1000]) {
		pointerAt(range.control(), 'pointermove', { clientX });
		values.push(range.value);
	}
	pointerAt(range.control(), 'pointerup', { clientX: -1000 });
	pressKey(range.control(), 'End');
	values.push(range.value);
	pressKey(range.control(), 'Home');
	values.push(range.value);

	expect(values).toEqual([65, 20, 65, 20]);
	expect(range.control().getAttribute('aria-valuemax')).toBe('110');

	range.value = 100;
	expect(range.value).toBe(100);
});

test('a cleared limit lets a drag reach the maximum again', () => {
	const range = mountRange('min="10" max="110" step="5" value="40"');
	const link = linkRange(range);

	link.limit([20, 65]);
	link.limit(undefined);
	pointerAt(range.control(), 'pointerdown', { clientX: 0 });
	pointerAt(range.control(), 'pointermove', { clientX: 1000 });

	expect(range.value).toBe(110);
});

test('a link reads held from the press until the release', () => {
	const range = mountRange('value="40"');
	const link = linkRange(range);
	const held: Array<boolean> = [link.isHeld()];

	pointerAt(range.control(), 'pointerdown', { clientX: 0 });
	held.push(link.isHeld());
	pointerAt(range.control(), 'pointerup', { clientX: 0 });
	held.push(link.isHeld());

	expect(held).toEqual([false, true, false]);
});
