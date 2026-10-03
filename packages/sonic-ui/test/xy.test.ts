import { expect, test, vi } from 'vitest';

import '#define/xy.ts';
import { SonicXy } from '#elements/xy.ts';
import { requireChild } from '#lib/render.ts';

import { pointerAt, pressKey, recordEvents } from './helpers.ts';

vi.hoisted(() => {
	Object.defineProperty(navigator, 'platform', { value: 'Win32' });
});

interface Pad {
	glass: HTMLElement;
	parent: HTMLElement;
	puck: HTMLElement;
	xy: SonicXy;
}

function mountXy(attributes: string): Pad {
	document.body.innerHTML = `<div><sonic-xy ${attributes}></sonic-xy></div>`;

	const parent = requireChild(document.body, 'div', HTMLDivElement);
	const field = requireChild(parent, '.sonic-xy-field', HTMLDivElement);
	const puck = requireChild(parent, '.sonic-xy-puck', HTMLDivElement);

	vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 220, 120));
	vi.spyOn(puck, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 20, 20));

	return {
		glass: requireChild(parent, '.sonic-xy', HTMLDivElement),
		parent,
		puck,
		xy: requireChild(parent, 'sonic-xy', SonicXy),
	};
}

const offset =
	'x="0" x-min="-50" x-max="50" x-step="0.5" y="150" y-min="100" y-max="200" y-step="2"';

test('a press on the glass puts each value at the pointer, on its own scale, with up as more', () => {
	const { glass, xy } = mountXy(
		'x-min="20" x-max="20000" x-taper="log" y-min="-24" y-max="24" y-step="0.5"',
	);

	pointerAt(glass, 'pointerdown', { clientX: 110, clientY: 35 });

	expect([xy.x, xy.y]).toEqual([632, 12]);
});

test('a value waits for its range, and an unset value rests at its own minimum', () => {
	const { xy } = mountXy('x="150" x-max="200" y-min="10"');

	expect([xy.x, xy.y]).toEqual([150, 10]);
});

test('a press on the puck moves nothing until the pointer travels', () => {
	const { puck, xy } = mountXy(offset);

	pointerAt(puck, 'pointerdown', { clientX: 60, clientY: 80 });
	pointerAt(puck, 'pointermove', { clientX: 62, clientY: 80 });
	expect([xy.x, xy.y]).toEqual([0, 150]);

	pointerAt(puck, 'pointermove', { clientX: 80, clientY: 70 });
	expect([xy.x, xy.y]).toEqual([10, 160]);
});

test('a drag reports input per move and one change, and owns both values until it ends', () => {
	const { parent, puck, xy } = mountXy(offset);
	const events = recordEvents(parent);

	pointerAt(puck, 'pointerdown', { clientX: 60, clientY: 80 });
	pointerAt(puck, 'pointermove', { clientX: 80, clientY: 80 });
	pointerAt(puck, 'pointermove', { clientX: 80, clientY: 70 });
	xy.x = 5;
	xy.setAttribute('y', '110');
	expect([xy.x, xy.y]).toEqual([10, 160]);

	pointerAt(puck, 'pointerup', { clientX: 80, clientY: 70 });
	expect(events).toEqual(['input', 'input', 'change']);

	xy.x = 5;
	expect(xy.x).toBe(5);
});

test('pointercancel puts both values back and reports no change', () => {
	const { parent, puck, xy } = mountXy(offset);
	const events = recordEvents(parent);

	pointerAt(puck, 'pointerdown', { clientX: 60, clientY: 80 });
	pointerAt(puck, 'pointermove', { clientX: 80, clientY: 70 });
	pointerAt(puck, 'pointercancel', { clientX: 80, clientY: 70 });
	pointerAt(puck, 'lostpointercapture', { clientX: 80, clientY: 70 });

	expect([xy.x, xy.y]).toEqual([0, 150]);
	expect(events).toEqual(['input', 'input']);
});

test('Alt holds the drag to one axis, and Shift moves both a tenth as far', () => {
	const { puck, xy } = mountXy(offset);

	pointerAt(puck, 'pointerdown', { clientX: 60, clientY: 80 });
	pointerAt(puck, 'pointermove', { altKey: true, clientX: 90, clientY: 70 });
	expect([xy.x, xy.y]).toEqual([15, 150]);

	pointerAt(puck, 'pointermove', { clientX: 110, clientY: 50, shiftKey: true });
	expect([xy.x, xy.y]).toEqual([16, 152]);
});

test('off Apple platforms, a Ctrl-click returns only the axis that has a default, as one change', () => {
	const { glass, parent, xy } = mountXy(`${offset} x-default="25"`);
	const events = recordEvents(parent);

	pointerAt(glass, 'pointerdown', { clientX: 200, clientY: 20, ctrlKey: true });

	expect([xy.x, xy.y]).toEqual([25, 150]);
	expect(events).toEqual(['input', 'change']);
});

test('off Apple platforms, a press with the Meta key down is an ordinary press', () => {
	const { glass, xy } = mountXy(`${offset} x-default="25"`);

	pointerAt(glass, 'pointerdown', { clientX: 60, clientY: 40, metaKey: true });

	expect([xy.x, xy.y]).toEqual([-25, 170]);
});

test('a secondary button on the glass moves nothing', () => {
	const { glass, xy } = mountXy(offset);

	pointerAt(glass, 'pointerdown', { button: 2, clientX: 200, clientY: 20 });
	pointerAt(glass, 'pointermove', { clientX: 180, clientY: 40 });

	expect([xy.x, xy.y]).toEqual([0, 150]);
});

test('lostpointercapture alone ends the drag with a change', () => {
	const { parent, puck, xy } = mountXy(offset);
	const events = recordEvents(parent);

	pointerAt(puck, 'pointerdown', { clientX: 60, clientY: 80 });
	pointerAt(puck, 'pointermove', { clientX: 80, clientY: 80 });
	pointerAt(puck, 'lostpointercapture', { clientX: 80, clientY: 80 });
	expect(events).toEqual(['input', 'change']);

	pointerAt(puck, 'pointermove', { clientX: 80, clientY: 70 });
	expect([xy.x, xy.y]).toEqual([10, 150]);
});

test('disabled mid-drag ends the drag with a change, and a later press does nothing', () => {
	const { glass, parent, puck, xy } = mountXy(offset);
	const events = recordEvents(parent);

	pointerAt(puck, 'pointerdown', { clientX: 60, clientY: 80 });
	pointerAt(puck, 'pointermove', { clientX: 80, clientY: 80 });
	xy.disabled = true;
	expect(events).toEqual(['input', 'change']);

	pointerAt(glass, 'pointerdown', { clientX: 200, clientY: 20 });
	expect([xy.x, xy.y]).toEqual([10, 150]);
});

function partOf(pad: Pad, axis: 'x' | 'y'): HTMLElement {
	return requireChild(pad.parent, `[data-sonic-axis="${axis}"]`, HTMLDivElement);
}

function stopOf(part: HTMLElement): Array<null | string> {
	return [part.getAttribute('tabindex'), part.getAttribute('aria-hidden')];
}

/* eslint-disable unicorn/no-null -- an absent attribute reads `null` */
const current = ['0', null];
/* eslint-enable unicorn/no-null */
const other = ['-1', 'true'];

const stepped = 'x="60" x-step="5" y="0" y-min="-24" y-max="24" y-step="0.5"';

test('each key moves its own axis by its own step, and Home and End page x', () => {
	const pad = mountXy(stepped);
	const { parent, xy } = pad;
	const events = recordEvents(parent);
	const part = partOf(pad, 'x');

	pressKey(part, 'ArrowUp');
	expect([xy.x, xy.y]).toEqual([60, 0.5]);
	expect(events).toEqual(['input', 'change']);

	pressKey(part, 'PageUp');
	expect(xy.y).toBe(5.5);

	pressKey(part, 'ArrowRight');
	expect([xy.x, xy.y]).toEqual([65, 5.5]);

	pressKey(part, 'Home');
	expect(xy.x).toBe(15);

	pressKey(part, 'End');
	expect(xy.x).toBe(65);
});

test('a key on the other axis moves the one tab stop and the focus to its part', () => {
	const pad = mountXy(stepped);
	const [x, y] = [partOf(pad, 'x'), partOf(pad, 'y')];

	x.focus();
	pressKey(x, 'ArrowUp');
	expect([stopOf(y), stopOf(x)]).toEqual([current, other]);
	expect(document.activeElement).toBe(y);

	pad.xy.blur();
	pad.xy.focus();
	expect(document.activeElement).toBe(y);

	pressKey(y, 'ArrowRight');
	expect([stopOf(x), stopOf(y)]).toEqual([current, other]);
	expect(document.activeElement).toBe(x);
});

test('each part carries its own value and range, and names its own axis first in the value text', () => {
	const pad = mountXy(`${stepped} x-label="Cutoff" y-label="Resonance"`);

	pad.xy.formatValue = (value, axis) => `${String(value)} ${axis === 'x' ? 'Hz' : 'dB'}`;

	const [x, y] = [partOf(pad, 'x'), partOf(pad, 'y')];

	expect(x.getAttribute('aria-valuetext')).toBe('Cutoff 60 Hz, Resonance 0 dB');
	expect(y.getAttribute('aria-valuetext')).toBe('Resonance 0 dB, Cutoff 60 Hz');
	expect([x.getAttribute('aria-valuenow'), y.getAttribute('aria-valuenow')]).toEqual(['60', '0']);
	expect([y.getAttribute('aria-valuemin'), y.getAttribute('aria-valuemax')]).toEqual(['-24', '24']);
});

test('Delete returns only the axis that has a default, and passes through with none', () => {
	const bare = mountXy(stepped);

	expect(pressKey(partOf(bare, 'x'), 'Delete').defaultPrevented).toBe(false);

	const pad = mountXy(`${stepped} y-default="-6"`);

	expect(pressKey(partOf(pad, 'x'), 'Delete').defaultPrevented).toBe(true);
	expect([pad.xy.x, pad.xy.y]).toEqual([60, -6]);
});

test('a disabled pad takes both parts out of the tab order and ignores keys', () => {
	const pad = mountXy(`${stepped} disabled`);
	const x = partOf(pad, 'x');

	pressKey(x, 'ArrowRight');

	expect(pad.xy.x).toBe(60);
	expect([x.hasAttribute('tabindex'), partOf(pad, 'y').hasAttribute('tabindex')]).toEqual([
		false,
		false,
	]);
	expect(x.getAttribute('aria-disabled')).toBe('true');
});

test('a second pointer leaves the drag alone, and the drag still ends with change', () => {
	const { parent, puck, xy } = mountXy(offset);
	const events = recordEvents(parent);

	pointerAt(puck, 'pointerdown', { clientX: 60, clientY: 80 });
	pointerAt(puck, 'pointermove', { clientX: 80, clientY: 80 });
	pointerAt(puck, 'pointerdown', { clientX: 60, clientY: 80, isPrimary: false, pointerId: 2 });
	pointerAt(puck, 'pointermove', { clientX: 80, clientY: 70 });
	pointerAt(puck, 'pointerup', { pointerId: 2 });
	pointerAt(puck, 'pointerup', { clientX: 80, clientY: 70 });

	expect([xy.x, xy.y]).toEqual([10, 160]);
	expect(events).toEqual(['input', 'input', 'change']);
});
