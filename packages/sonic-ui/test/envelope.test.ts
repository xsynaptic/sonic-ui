import { afterEach, expect, test, vi } from 'vitest';

import '#define/dial.ts';
import '#define/envelope.ts';
import { SonicDial } from '#elements/dial.ts';
import { SonicEnvelope } from '#elements/envelope.ts';
import { requireChild } from '#lib/render.ts';

import { pointerAt } from './helpers.ts';

afterEach(() => {
	vi.useRealTimers();
});

type Stage = 'attack' | 'decay' | 'release' | 'sustain';

interface Rig {
	dials: Record<Stage, SonicDial>;
	envelope: SonicEnvelope;
	events: Array<string>;
	handle: (stage: string) => HTMLElement;
}

const dialMarkup = `
	<sonic-dial id="attack" min="0.5" max="2.5" step="0.01" value="1.5"></sonic-dial>
	<sonic-dial id="decay" min="100" max="1100" midpoint="350" step="0.5" value="350"></sonic-dial>
	<sonic-dial id="sustain" min="-60" max="0" step="0.5" value="-30"></sonic-dial>
	<sonic-dial id="release" min="1" max="5" step="0.1" value="5"></sonic-dial>
`;

const bound = 'attack="attack" decay="decay" sustain="sustain" release="release"';

function mount(html: string): Rig {
	document.body.innerHTML = html;

	const envelope = requireChild(document.body, 'sonic-envelope', SonicEnvelope);
	const parent = requireChild(document.body, '#dials', HTMLDivElement);
	const events: Array<string> = [];

	vi.spyOn(
		requireChild(envelope, '.sonic-envelope-graph', SVGElement),
		'getBoundingClientRect',
	).mockReturnValue(new DOMRect(0, 0, 400, 100));
	for (const type of ['input', 'change']) {
		parent.addEventListener(type, (event) => {
			events.push(`${type} ${event.target instanceof Element ? event.target.id : ''}`);
		});
		envelope.addEventListener(type, () => {
			events.push(`${type} envelope`);
		});
	}

	return {
		dials: {
			attack: requireChild(parent, '#attack', SonicDial),
			decay: requireChild(parent, '#decay', SonicDial),
			release: requireChild(parent, '#release', SonicDial),
			sustain: requireChild(parent, '#sustain', SonicDial),
		},
		envelope,
		events,
		handle: (stage) => requireChild(envelope, `[data-sonic-stage="${stage}"]`, HTMLDivElement),
	};
}

function mountBound(): Rig {
	return mount(`<div id="dials">${dialMarkup}</div><sonic-envelope ${bound}></sonic-envelope>`);
}

function drag(target: HTMLElement, by: { x: number; y: number }): void {
	const to = { clientX: 100 + by.x, clientY: 100 + by.y };

	pointerAt(target, 'pointerdown', { clientX: 100, clientY: 100 });
	pointerAt(target, 'pointermove', to);
	pointerAt(target, 'pointerup', to);
}

function proportionOf(handle: HTMLElement, axis: 'x' | 'y'): number {
	return Number(handle.style.getPropertyValue(`--_sonic-envelope-${axis}`));
}

function drawn({ envelope, handle }: Rig): Array<null | number | string> {
	return [
		proportionOf(handle('decay'), 'x'),
		proportionOf(handle('decay'), 'y'),
		requireChild(envelope, '.sonic-envelope-line', SVGElement).getAttribute('d'),
	];
}

test("the decay handle moves each dial along that dial's own mapping, a share wide and the graph tall", () => {
	const { dials, handle } = mountBound();

	drag(handle('decay'), { x: 25, y: -20 });

	expect(dials.decay.value).toBe(662.5);
	expect(dials.sustain.value).toBe(-18);
});

test('a decay handle drag draws the line and the handle where its two dials end up, and later writes still draw', () => {
	const dragged = mountBound();

	drag(dragged.handle('decay'), { x: 25, y: -20 });

	const afterDrag = drawn(dragged);

	dragged.dials.attack.value = 2.5;

	const afterWrite = drawn(dragged);
	const written = mountBound();

	written.dials.decay.value = 662.5;
	written.dials.sustain.value = -18;
	expect(afterDrag).toEqual(drawn(written));

	written.dials.attack.value = 2.5;
	expect(afterWrite).toEqual(drawn(written));
	expect(afterWrite).not.toEqual(afterDrag);
});

test('a handle drag is heard as its dials turning, with one change per dial that moved', () => {
	const { events, handle } = mountBound();

	drag(handle('decay'), { x: 25, y: -20 });

	expect(events).toEqual(['input decay', 'input sustain', 'change decay', 'change sustain']);
});

test("a handle drag reports its pointer type through its dials' changes, then drops it", () => {
	const { envelope, handle } = mountBound();
	const reported: Array<string | undefined> = [];

	document.body.addEventListener('change', () => {
		reported.push(envelope.pointerType);
	});
	pointerAt(handle('decay'), 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
	pointerAt(handle('decay'), 'pointermove', { clientX: 125, clientY: 80 });
	pointerAt(handle('decay'), 'pointerup', { clientX: 125, clientY: 80 });

	expect(reported).toEqual(['touch', 'touch']);
	expect(envelope.pointerType).toBeUndefined();
});

test('a time handle has no level to move', () => {
	const { dials, events, handle } = mountBound();

	drag(handle('attack'), { x: 0, y: -40 });

	expect([dials.attack.value, dials.sustain.value]).toEqual([1.5, -30]);
	expect(events).toEqual([]);
});

test('a delay and a hold each take a share and a handle, the hold at full level, and the hold handle turns its dial alone', () => {
	const { dials, envelope, handle } = mount(`
		<div id="dials">
			${dialMarkup}
			<sonic-dial id="delay" max="100" value="50"></sonic-dial>
			<sonic-dial id="hold" max="200" value="50"></sonic-dial>
		</div>
		<sonic-envelope ${bound} delay="delay" hold="hold"></sonic-envelope>
	`);
	const hold = requireChild(document.body, '#hold', SonicDial);
	const xOf = (stage: string): number => proportionOf(handle(stage), 'x');

	expect([handle('delay').hidden, handle('hold').hidden]).toEqual([false, false]);
	expect(xOf('delay')).toBeCloseTo(0.5 / 6, 4);
	expect(xOf('attack')).toBeCloseTo(1 / 6, 4);
	expect(xOf('hold')).toBeCloseTo(1.25 / 6, 4);
	expect([proportionOf(handle('delay'), 'y'), proportionOf(handle('hold'), 'y')]).toEqual([0, 1]);

	drag(handle('hold'), { x: 20, y: -40 });

	expect(hold.value).toBe(110);
	expect([dials.attack.value, dials.sustain.value]).toEqual([1.5, -30]);
	expect(xOf('hold')).toBeCloseTo(1.55 / 6, 4);
	expect(xOf('release')).toBeCloseTo(4.05 / 6, 4);

	envelope.hold = undefined;
	expect(handle('hold').hidden).toBe(true);
	expect(xOf('release')).toBeCloseTo(3.5 / 5, 4);
});

test('a scripted write to a dial redraws the line and every handle after it', () => {
	const { dials, envelope, handle } = mountBound();
	const line = requireChild(envelope, '.sonic-envelope-line', SVGElement);
	const before = line.getAttribute('d');

	expect([proportionOf(handle('decay'), 'x'), proportionOf(handle('release'), 'x')]).toEqual([
		0.25, 0.75,
	]);

	dials.decay.value = 1100;

	expect([proportionOf(handle('decay'), 'x'), proportionOf(handle('release'), 'x')]).toEqual([
		0.375, 0.875,
	]);
	expect(line.getAttribute('d')).not.toBe(before);
});

test('an envelope connected before its dials draws once its attribute is set again, and follows a range change', () => {
	const { dials, envelope, handle } = mount(
		`<sonic-envelope attack="attack"></sonic-envelope><div id="dials">${dialMarkup}</div>`,
	);
	const attack = handle('attack');

	envelope.attack = 'missing';
	expect(attack.hidden).toBe(true);

	envelope.attack = 'attack';
	expect([attack.hidden, proportionOf(attack, 'x')]).toEqual([false, 0.25]);

	dials.attack.max = 4.5;
	expect(proportionOf(attack, 'x')).toBe(0.125);
});

test("a disabled dial's handle does not move it, and the other axis still drags", () => {
	const { dials, handle } = mountBound();

	dials.decay.disabled = true;
	drag(handle('decay'), { x: 25, y: -20 });
	expect([dials.decay.value, dials.sustain.value]).toEqual([350, -18]);

	dials.sustain.disabled = true;
	expect(handle('decay').matches('[data-sonic-disabled]')).toBe(true);

	drag(handle('decay'), { x: 25, y: -20 });
	expect([dials.decay.value, dials.sustain.value]).toEqual([350, -18]);
});

test('a disabled envelope marks every handle still and drags none, until it is enabled again', () => {
	const { dials, envelope, events, handle } = mountBound();

	envelope.disabled = true;
	expect(handle('decay').matches('[data-sonic-disabled]')).toBe(true);

	drag(handle('decay'), { x: 25, y: -20 });
	expect([dials.decay.value, dials.sustain.value]).toEqual([350, -30]);
	expect(events).toEqual([]);

	envelope.disabled = false;
	expect(handle('decay').matches('[data-sonic-disabled]')).toBe(false);

	drag(handle('decay'), { x: 25, y: -20 });
	expect([dials.decay.value, dials.sustain.value]).toEqual([662.5, -18]);
});

test('disabling the envelope mid-drag ends the drag where it is and reports the change', () => {
	const { dials, envelope, events, handle } = mountBound();
	const decay = handle('decay');

	pointerAt(decay, 'pointerdown', { clientX: 100, clientY: 100 });
	pointerAt(decay, 'pointermove', { clientX: 125, clientY: 80 });
	envelope.disabled = true;
	pointerAt(decay, 'pointermove', { clientX: 150, clientY: 60 });

	expect([dials.decay.value, dials.sustain.value]).toEqual([662.5, -18]);
	expect(events.filter((event) => event.startsWith('change'))).toEqual([
		'change decay',
		'change sustain',
	]);
});

test('a cancelled drag puts both dials back and reports no change', () => {
	const { dials, events, handle } = mountBound();
	const decay = handle('decay');

	pointerAt(decay, 'pointerdown', { clientX: 100, clientY: 100 });
	pointerAt(decay, 'pointermove', { clientX: 125, clientY: 80 });
	pointerAt(decay, 'pointercancel', { clientX: 125, clientY: 80 });

	expect([dials.decay.value, dials.sustain.value]).toEqual([350, -30]);
	expect(events.filter((event) => event.startsWith('change'))).toEqual([]);
});

test("the attack's curve handle turns its curve dial and no time dial, upward for a quicker rise", () => {
	const rig = mount(
		`<div id="dials">${dialMarkup}<sonic-dial id="curve" min="-8" max="8" step="0.5" value="2"></sonic-dial></div>
		<sonic-envelope ${bound} attack-curve="curve"></sonic-envelope>`,
	);
	const curveHandle = requireChild(
		rig.envelope,
		'.sonic-envelope-curve[data-sonic-stage="attack"]',
		HTMLDivElement,
	);
	const curveDial = requireChild(document.body, '#curve', SonicDial);
	const before = proportionOf(curveHandle, 'y');

	expect(curveHandle.hidden).toBe(false);
	expect(
		requireChild(rig.envelope, '.sonic-envelope-curve[data-sonic-stage="decay"]', HTMLDivElement)
			.hidden,
	).toBe(true);

	drag(curveHandle, { x: 30, y: -25 });

	expect(curveDial.value).toBe(-2);
	expect(rig.dials.attack.value).toBe(1.5);
	expect(proportionOf(curveHandle, 'y')).toBeGreaterThan(before);
	expect(rig.events).toEqual(['input curve', 'change curve']);
});

test("the readout carries the held part's dials, x then y, in each dial's own format", () => {
	const { dials, envelope, handle } = mount(
		`<div id="dials">${dialMarkup}<sonic-dial id="curve" min="-8" max="8" step="0.25" value="2"></sonic-dial></div>
		<sonic-envelope ${bound} decay-curve="curve" readout></sonic-envelope>`,
	);
	const text = requireChild(envelope, '.sonic-envelope-readout > span', HTMLSpanElement);
	const curveHandle = requireChild(
		envelope,
		'.sonic-envelope-curve[data-sonic-stage="decay"]',
		HTMLElement,
	);

	vi.useFakeTimers();
	dials.decay.formatValue = (value) => `${String(value)} ms`;
	dials.sustain.formatValue = (value) => `${String(value)} dB`;

	pointerAt(handle('decay'), 'pointerdown', { clientX: 100, clientY: 100 });
	pointerAt(handle('decay'), 'pointermove', { clientX: 125, clientY: 80 });
	expect(text.textContent).toBe('662.5 ms, -18 dB');

	pointerAt(handle('decay'), 'pointerup', { clientX: 125, clientY: 80 });
	pointerAt(handle('attack'), 'pointerdown', { clientX: 100, clientY: 100 });
	vi.advanceTimersByTime(250);
	expect(text.textContent).toBe('1.5');

	pointerAt(handle('attack'), 'pointerup', { clientX: 100, clientY: 100 });
	pointerAt(curveHandle, 'pointerdown', { clientX: 100, clientY: 100 });
	pointerAt(curveHandle, 'pointermove', { clientX: 100, clientY: 90 });
	expect(text.textContent).toBe('3.5');
});

test('the readout is anchored to the held part alone', () => {
	const { envelope, handle } = mount(
		`<div id="dials">${dialMarkup}</div><sonic-envelope ${bound} readout></sonic-envelope>`,
	);
	const bubble = requireChild(envelope, '.sonic-envelope-readout', HTMLElement);
	const anchors = (): Array<string> =>
		['attack', 'decay'].map((stage) => handle(stage).style.getPropertyValue('anchor-name'));

	drag(handle('decay'), { x: 25, y: -20 });
	expect(anchors()).toEqual(['', bubble.style.getPropertyValue('position-anchor')]);

	drag(handle('attack'), { x: 25, y: 0 });
	expect(anchors()).toEqual([bubble.style.getPropertyValue('position-anchor'), '']);
	expect(bubble.style.getPropertyValue('position-anchor')).toMatch(/^--sonic-readout-\d+$/);
});

function mountRevealing(): { reveals: Array<string>; rig: Rig } {
	const rig = mount(
		`<section><div id="dials">${dialMarkup}</div><sonic-envelope ${bound}></sonic-envelope></section>`,
	);
	const control = requireChild(rig.envelope, '.sonic-envelope', HTMLDivElement);
	const reveals: Array<string> = [];

	requireChild(document.body, 'section', HTMLElement).addEventListener('sonic-reveal', (event) => {
		const from = event.target instanceof Element ? event.target.localName : '';

		reveals.push(`${from} ${String(control.matches('[data-sonic-revealed]'))}`);
	});

	return { reveals, rig };
}

test('a handle drag marks the envelope revealed and reports it once as it engages, and once more when let go', () => {
	const { reveals, rig } = mountRevealing();
	const handle = rig.handle('decay');

	pointerAt(handle, 'pointerdown', { clientX: 100, clientY: 100 });
	expect(reveals).toEqual([]);

	pointerAt(handle, 'pointermove', { clientX: 125, clientY: 80 });
	pointerAt(handle, 'pointermove', { clientX: 130, clientY: 80 });
	expect(reveals).toEqual(['sonic-envelope true']);
	expect(rig.envelope.revealed).toBe(true);

	pointerAt(handle, 'pointerup', { clientX: 130, clientY: 80 });
	expect(reveals).toEqual(['sonic-envelope true', 'sonic-envelope false']);
});

test('a press let go before the reveal delay reports no reveal', () => {
	const { reveals, rig } = mountRevealing();
	const handle = rig.handle('attack');

	vi.useFakeTimers();
	pointerAt(handle, 'pointerdown', { clientX: 100, clientY: 100 });
	vi.advanceTimersByTime(100);
	pointerAt(handle, 'pointerup', { clientX: 100, clientY: 100 });
	vi.advanceTimersByTime(1000);

	expect(reveals).toEqual([]);
});
