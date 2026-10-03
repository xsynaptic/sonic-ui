import { expect, test, vi } from 'vitest';

import '#define/dial.ts';
import '#define/envelope.ts';
import { SonicDial } from '#elements/dial.ts';
import { SonicEnvelope } from '#elements/envelope.ts';
import { requireChild } from '#lib/render.ts';

import { pointerAt } from './helpers.ts';

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
	const parent = requireChild(document.body, '#knobs', HTMLDivElement);
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
	return mount(`<div id="knobs">${dialMarkup}</div><sonic-envelope ${bound}></sonic-envelope>`);
}

function drag(target: HTMLElement, by: { x: number; y: number }): void {
	const to = { clientX: 100 + by.x, clientY: 100 + by.y };

	pointerAt(target, 'pointerdown', { clientX: 100, clientY: 100 });
	pointerAt(target, 'pointermove', to);
	pointerAt(target, 'pointerup', to);
}

function placeOf(handle: HTMLElement, axis: 'x' | 'y'): number {
	return Number(handle.style.getPropertyValue(`--_sonic-envelope-${axis}`));
}

test("the decay handle moves each dial along that dial's own scale, a share wide and the graph tall", () => {
	const { dials, handle } = mountBound();

	drag(handle('decay'), { x: 25, y: -20 });

	expect(dials.decay.value).toBe(662.5);
	expect(dials.sustain.value).toBe(-18);
});

test('a handle drag is heard as its dials turning, with one change per dial that moved', () => {
	const { events, handle } = mountBound();

	drag(handle('decay'), { x: 25, y: -20 });

	expect(events).toEqual(['input decay', 'input sustain', 'change decay', 'change sustain']);
});

test('a time handle has no level to move', () => {
	const { dials, events, handle } = mountBound();

	drag(handle('attack'), { x: 0, y: -40 });

	expect([dials.attack.value, dials.sustain.value]).toEqual([1.5, -30]);
	expect(events).toEqual([]);
});

test('a scripted write to a dial redraws the line and every handle after it', () => {
	const { dials, envelope, handle } = mountBound();
	const line = requireChild(envelope, '.sonic-envelope-line', SVGElement);
	const before = line.getAttribute('d');

	expect([placeOf(handle('decay'), 'x'), placeOf(handle('release'), 'x')]).toEqual([0.25, 0.75]);

	dials.decay.value = 1100;

	expect([placeOf(handle('decay'), 'x'), placeOf(handle('release'), 'x')]).toEqual([0.375, 0.875]);
	expect(line.getAttribute('d')).not.toBe(before);
});

test('an envelope connected before its dials draws once its attribute is set again, and follows a range change', () => {
	const { dials, envelope, handle } = mount(
		`<sonic-envelope attack="attack"></sonic-envelope><div id="knobs">${dialMarkup}</div>`,
	);
	const attack = handle('attack');

	envelope.attack = 'missing';
	expect(attack.hidden).toBe(true);

	envelope.attack = 'attack';
	expect([attack.hidden, placeOf(attack, 'x')]).toEqual([false, 0.25]);

	dials.attack.max = 4.5;
	expect(placeOf(attack, 'x')).toBe(0.125);
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

test('a cancelled drag puts both dials back and reports no change', () => {
	const { dials, events, handle } = mountBound();
	const decay = handle('decay');

	pointerAt(decay, 'pointerdown', { clientX: 100, clientY: 100 });
	pointerAt(decay, 'pointermove', { clientX: 125, clientY: 80 });
	pointerAt(decay, 'pointercancel', { clientX: 125, clientY: 80 });

	expect([dials.decay.value, dials.sustain.value]).toEqual([350, -30]);
	expect(events.filter((event) => event.startsWith('change'))).toEqual([]);
});

test("the attack's dot bends its curve dial and no time dial, upward for a quicker rise", () => {
	const rig = mount(
		`<div id="knobs">${dialMarkup}<sonic-dial id="bend" min="-8" max="8" step="0.5" value="2"></sonic-dial></div>
		<sonic-envelope ${bound} attack-curve="bend"></sonic-envelope>`,
	);
	const dot = requireChild(
		rig.envelope,
		'.sonic-envelope-dot[data-sonic-stage="attack"]',
		HTMLDivElement,
	);
	const bend = requireChild(document.body, '#bend', SonicDial);
	const before = placeOf(dot, 'y');

	expect(dot.hidden).toBe(false);
	expect(
		requireChild(rig.envelope, '.sonic-envelope-dot[data-sonic-stage="decay"]', HTMLDivElement)
			.hidden,
	).toBe(true);

	drag(dot, { x: 30, y: -25 });

	expect(bend.value).toBe(-2);
	expect(rig.dials.attack.value).toBe(1.5);
	expect(placeOf(dot, 'y')).toBeGreaterThan(before);
	expect(rig.events).toEqual(['input bend', 'change bend']);
});
