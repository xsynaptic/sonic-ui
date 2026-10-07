import { expect, test } from 'vitest';

import { linkValue, SonicValueElement } from '#elements/value-element.ts';

import { pointerAt, pressKey, recordEvents } from './helpers.ts';

class SeamControl extends SonicValueElement {
	fromProportion: number | undefined;

	readonly played: Array<number> = [];

	readonly #control = Object.assign(document.createElement('div'), {
		innerHTML: '<div popover="manual"><span></span><input hidden /></div>',
	});

	control(): HTMLElement {
		return this.#control;
	}

	protected connect(signal: AbortSignal): void {
		this.keepControl(this.#control, signal);
		this.render();
		this.bindGestures(this.#control, signal, () => {
			const axis = { position: (event: PointerEvent) => event.clientX, travelPx: 200 };

			return this.fromProportion === undefined
				? axis
				: { ...axis, fromProportion: this.fromProportion };
		});
	}

	protected draw(): void {
		// Nothing drawn beyond the ARIA the base writes
	}

	protected override focusTarget(): HTMLElement {
		return this.#control;
	}

	protected override scrubChanged(): void {
		this.played.push(this.scrubState().played);
	}
}

customElements.define('seam-control', SeamControl);

function mountSeam(attributes: string): SeamControl {
	document.body.innerHTML = `<seam-control ${attributes}></seam-control>`;

	const seam = document.querySelector('seam-control');
	if (!(seam instanceof SeamControl)) throw new Error('The control did not render');

	return seam;
}

test('a value written mid-drag moves where the scrub played and leaves the drag its value', () => {
	const seam = mountSeam('value="40"');
	const events = recordEvents(document.body);
	const changed: Array<number> = [];

	seam.addEventListener('change', () => {
		changed.push(seam.value);
	});
	pointerAt(seam.control(), 'pointerdown', { clientX: 100 });
	pointerAt(seam.control(), 'pointermove', { clientX: 150 });
	seam.value = 10;
	seam.setAttribute('value', '20');

	expect(seam.played).toEqual([40, 10, 20]);
	expect(seam.value).toBe(65);

	pointerAt(seam.control(), 'pointerup', { clientX: 150 });
	expect(events).toEqual(['input', 'change']);
	expect(changed).toEqual([65]);
});

test('a grab carrying fromProportion starts the drag there rather than at the value', () => {
	const seam = mountSeam('min="-40" max="40" value="0"');

	seam.fromProportion = 0.75;
	pointerAt(seam.control(), 'pointerdown', { clientX: 100 });
	pointerAt(seam.control(), 'pointermove', { clientX: 120 });

	expect(seam.value).toBe(28);
});

test('a link watch hears a scripted write, a change of bounds and a key press, until it lets go', () => {
	const seam = mountSeam('min="10" max="50" step="5" value="40"');
	const seen: Array<number> = [];
	const link = linkValue(seam);
	const unwatch = link.model.watch(() => {
		seen.push(link.model.value);
	});

	seam.value = 20;
	seam.setAttribute('max', '15');
	pressKey(seam.control(), 'ArrowDown');
	expect(seen).toEqual([20, 15, 10]);

	unwatch();
	seam.value = 15;
	expect(seen).toEqual([20, 15, 10]);
});

test("a link's input reports input and never change, and nothing when the value snaps back", () => {
	const seam = mountSeam('min="10" max="50" step="5" value="40"');
	const events = recordEvents(document.body);
	const link = linkValue(seam);

	expect(link.input(41)).toBe(false);
	expect(events).toEqual([]);

	expect(link.input(33)).toBe(true);
	expect(seam.value).toBe(35);
	expect(events).toEqual(['input']);
});

test("a link's input leaves the value alone while the seam's own drag holds it", () => {
	const seam = mountSeam('value="40"');
	const link = linkValue(seam);

	pointerAt(seam.control(), 'pointerdown', { clientX: 100 });
	pointerAt(seam.control(), 'pointermove', { clientX: 150 });

	expect(link.input(10)).toBe(false);
	expect(seam.value).toBe(65);

	pointerAt(seam.control(), 'pointerup', { clientX: 150 });
	expect(link.input(10)).toBe(true);
});

test('a limit stops a drag and the keys inside it, and leaves the bounds and property writes alone', () => {
	const seam = mountSeam('min="10" max="110" step="5" value="40"');
	const link = linkValue(seam);
	const values: Array<number> = [];

	link.model.setLimit([20, 65]);
	pointerAt(seam.control(), 'pointerdown', { clientX: 0 });
	for (const clientX of [1000, -1000]) {
		pointerAt(seam.control(), 'pointermove', { clientX });
		values.push(seam.value);
	}
	pointerAt(seam.control(), 'pointerup', { clientX: -1000 });
	pressKey(seam.control(), 'End');
	values.push(seam.value);
	pressKey(seam.control(), 'Home');
	values.push(seam.value);

	expect(values).toEqual([65, 20, 65, 20]);
	expect(seam.control().getAttribute('aria-valuemax')).toBe('110');

	seam.value = 100;
	expect(seam.value).toBe(100);
});

test('a cleared limit lets a drag reach the maximum again', () => {
	const seam = mountSeam('min="10" max="110" step="5" value="40"');
	const link = linkValue(seam);

	link.model.setLimit([20, 65]);
	link.model.setLimit(undefined);
	pointerAt(seam.control(), 'pointerdown', { clientX: 0 });
	pointerAt(seam.control(), 'pointermove', { clientX: 1000 });

	expect(seam.value).toBe(110);
});

test('a link reads held from the press until the release', () => {
	const seam = mountSeam('value="40"');
	const link = linkValue(seam);
	const held: Array<boolean> = [link.isHeld()];

	pointerAt(seam.control(), 'pointerdown', { clientX: 0 });
	held.push(link.isHeld());
	pointerAt(seam.control(), 'pointerup', { clientX: 0 });
	held.push(link.isHeld());

	expect(held).toEqual([false, true, false]);
});
