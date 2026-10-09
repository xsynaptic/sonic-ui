import { afterEach, expect, test, vi } from 'vitest';

import type { SonicRegion } from '#elements/region.ts';
import type { SonicWavestrip } from '#elements/wavestrip.ts';

import '#define/region.ts';
import '#define/wavestrip.ts';

import { FakeResizeObserver, installCanvasFakes } from './canvas-fakes.ts';
import { mountControl, nextTask, pointerAt } from './helpers.ts';

afterEach(() => {
	document.body.replaceChildren();
});

interface Mounted {
	canvas: HTMLCanvasElement;
	control: HTMLElement;
	events: Array<string>;
	region: SonicRegion;
	wavestrip: SonicWavestrip;
}

function recordTargets(): Array<string> {
	const events: Array<string> = [];

	for (const type of ['input', 'change']) {
		document.body.addEventListener(type, (event) => {
			events.push(`${type} ${event.target instanceof Element ? event.target.localName : ''}`);
		});
	}

	return events;
}

// A second a pixel from 30, so a region from 100 to 130 has its body from 70px to 100px
function mountStrip(attributes = '', regionAttributes = ''): Mounted {
	installCanvasFakes();

	const { control, host: wavestrip } = mountControl(
		'sonic-wavestrip',
		`min="30" max="330" step="0.5" value="50" ${attributes}`,
		`<sonic-region aria-label="Loop" start="100" end="130" ${regionAttributes}></sonic-region>`,
	);
	const region = wavestrip.querySelector('sonic-region');
	const canvas = control.querySelector('canvas');
	if (!region || !canvas) throw new Error('The strip did not draw');

	const box = new DOMRect(0, 0, 300, 48);

	vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(box);
	vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(box);
	FakeResizeObserver.instances.at(-1)?.report([300, 48], [300, 48]);

	return { canvas, control, events: recordTargets(), region, wavestrip };
}

function parts(control: HTMLElement): Array<HTMLElement> {
	return [...control.querySelectorAll<HTMLElement>('.sonic-region')];
}

function key(target: HTMLElement, type: string, init: KeyboardEventInit): void {
	target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }));
}

test('a drag from inside a region moves it with its length kept, and the strip neither seeks nor reports', () => {
	const { control, events, region, wavestrip } = mountStrip();

	pointerAt(control, 'pointerdown', { clientX: 80, clientY: 24 });
	expect([wavestrip.value, region.dragging, wavestrip.dragging]).toEqual([50, true, false]);

	pointerAt(control, 'pointermove', { clientX: 82, clientY: 24 });
	expect(region.start).toBe(100);

	pointerAt(control, 'pointermove', { clientX: 90.2, clientY: 24 });
	pointerAt(control, 'pointermove', { clientX: 110.2, clientY: 24, shiftKey: true });
	expect([region.start, region.end]).toEqual([112, 142]);

	pointerAt(control, 'pointerup', { clientX: 110.2, clientY: 24 });
	expect(events).toEqual(['input sonic-region', 'input sonic-region', 'change sonic-region']);
	expect([wavestrip.value, region.dragging, wavestrip.revealed]).toEqual([50, false, false]);
});

test('a press let go inside a region before it travels seeks to the press, on the release', () => {
	const { control, events, region, wavestrip } = mountStrip();

	pointerAt(control, 'pointerdown', { clientX: 80, clientY: 24 });
	pointerAt(control, 'pointermove', { clientX: 81, clientY: 24 });
	expect(wavestrip.value).toBe(50);

	pointerAt(control, 'pointerup', { clientX: 81, clientY: 24 });
	expect(wavestrip.value).toBe(110);
	expect(region.start).toBe(100);
	expect(events).toEqual(['input sonic-wavestrip', 'change sonic-wavestrip']);
});

test('a point marker inside a region still takes the press, and seeks at once', () => {
	const { control, region, wavestrip } = mountStrip();

	wavestrip.markers = [{ start: 112 }];
	pointerAt(control, 'pointerdown', { clientX: 80, clientY: 2 });
	pointerAt(control, 'pointermove', { clientX: 95, clientY: 2 });

	expect(wavestrip.value).toBe(125);
	expect([region.start, region.dragging]).toEqual([100, false]);
});

test('a disabled region takes no press, so the strip seeks on the press as it does elsewhere', () => {
	const { control, region, wavestrip } = mountStrip('', 'disabled');
	const [part] = parts(control);

	pointerAt(control, 'pointerdown', { clientX: 80, clientY: 24 });
	expect(wavestrip.value).toBe(110);

	pointerAt(control, 'pointermove', { clientX: 90, clientY: 24 });
	expect([wavestrip.value, region.start]).toEqual([120, 100]);
	expect([part?.getAttribute('aria-disabled'), part?.hasAttribute('tabindex')]).toEqual([
		'true',
		false,
	]);
});

test('a held region ignores a write, and a write after the release lands', () => {
	const { control, region } = mountStrip();

	pointerAt(control, 'pointerdown', { clientX: 80, clientY: 24 });
	region.start = 40;
	region.setAttribute('end', '70');
	pointerAt(control, 'pointermove', { clientX: 90, clientY: 24 });
	expect([region.start, region.end]).toEqual([110, 140]);

	pointerAt(control, 'pointerup', { clientX: 90, clientY: 24 });
	region.start = 40;
	expect([region.start, region.end]).toEqual([40, 140]);
});

test('with cancellable, a region dragged far off the strip goes back and its release changes nothing', () => {
	const { control, events, region } = mountStrip('cancellable');

	pointerAt(control, 'pointerdown', { clientX: 80, clientY: 24 });
	pointerAt(control, 'pointermove', { clientX: 90, clientY: 24 });
	pointerAt(control, 'pointermove', { clientX: 95, clientY: 120 });
	pointerAt(control, 'pointerup', { clientX: 95, clientY: 120 });

	expect(region.start).toBe(100);
	expect(events).toEqual(['input sonic-region', 'input sonic-region']);
});

test.each([
	['a cancelled pointer', 'pointercancel', 1],
	['a second finger', 'pointerdown', 2],
])('%s puts a dragged region back with one input and no change', (_case, type, pointerId) => {
	const { control, events, region, wavestrip } = mountStrip();

	pointerAt(control, 'pointerdown', { clientX: 80, clientY: 24 });
	pointerAt(control, 'pointermove', { clientX: 90, clientY: 24 });
	pointerAt(control, type, { clientX: 200, clientY: 24, pointerId });
	pointerAt(control, 'pointermove', { clientX: 120, clientY: 24 });

	expect([region.start, region.dragging, wavestrip.value]).toEqual([100, false, 50]);
	expect(events).toEqual(['input sonic-region', 'input sonic-region']);
});

test('keys on a focused region step it by the strip’s step and stop where its length still fits', () => {
	const { control, events, region, wavestrip } = mountStrip();
	const [part] = parts(control);
	if (!part) throw new Error('The region was not drawn');

	key(part, 'keydown', { key: 'ArrowRight' });
	expect([region.start, region.end, wavestrip.value]).toEqual([100.5, 130.5, 50]);
	expect(events).toEqual(['input sonic-region', 'change sonic-region']);

	key(part, 'keydown', { key: 'PageDown' });
	expect(region.start).toBe(95.5);

	key(part, 'keydown', { key: 'End' });
	expect([region.start, region.end]).toEqual([300, 330]);

	key(part, 'keydown', { key: 'Home' });
	expect([region.start, region.end]).toEqual([30, 60]);
});

test('a repeating key scrubs a region, holds writes, and changes once on keyup', () => {
	const { control, events, region } = mountStrip();
	const [part] = parts(control);
	if (!part) throw new Error('The region was not drawn');

	key(part, 'keydown', { key: 'ArrowRight' });
	events.length = 0;
	key(part, 'keydown', { key: 'ArrowRight', repeat: true });
	region.start = 40;
	key(part, 'keydown', { key: 'ArrowRight', repeat: true });
	expect(events).toEqual(['input sonic-region', 'input sonic-region']);

	key(part, 'keyup', { key: 'ArrowRight' });
	expect(events.at(-1)).toBe('change sonic-region');
	expect([region.start, region.dragging]).toEqual([101.5, false]);
});

test('the drawn region is a named slider that speaks its start, or what the host words of both ends, over the travel its length allows', () => {
	document.body.lang = 'en';

	const { canvas, control, wavestrip } = mountStrip();
	const [part] = parts(control);
	const read = (name: string): null | string | undefined => part?.getAttribute(name);

	expect([
		read('role'),
		read('aria-label'),
		read('aria-valuenow'),
		read('aria-valuemin'),
		read('aria-valuemax'),
		read('aria-valuetext'),
	]).toEqual(['slider', 'Loop', '100', '30', '300', '1 minute, 40 seconds']);

	wavestrip.formatSpokenRegion = (start, end) => `${String(start)} bis ${String(end)}`;
	expect(read('aria-valuetext')).toBe('100 bis 130');

	expect(canvas.getAttribute('role')).toBe('slider');
	document.body.removeAttribute('lang');
});

test('a region added later is drawn after the others, one taken out is dropped, and one past a bound is cut there', async () => {
	const { control, region, wavestrip } = mountStrip();
	const added = document.createElement('sonic-region');

	added.setAttribute('start', '-20');
	added.setAttribute('end', '180');
	added.setAttribute('aria-label', 'Window');
	wavestrip.append(added);
	await nextTask();

	const [first, second] = parts(control);

	expect(parts(control)).toHaveLength(2);
	expect(first?.getAttribute('aria-label')).toBe('Loop');
	expect([
		second?.style.getPropertyValue('--_sonic-region-from'),
		second?.style.getPropertyValue('--_sonic-region-to'),
		second?.dataset.sonicClipped,
	]).toEqual(['0', '0.5', 'start']);

	region.remove();
	await nextTask();
	expect(parts(control)).toEqual([second]);
});

test('of two regions over one spot the later one is picked up', async () => {
	const { control, region, wavestrip } = mountStrip();
	const later = document.createElement('sonic-region');

	later.setAttribute('start', '105');
	later.setAttribute('end', '160');
	later.setAttribute('aria-label', 'Later');
	wavestrip.append(later);
	await nextTask();

	pointerAt(control, 'pointerdown', { clientX: 80, clientY: 24 });
	pointerAt(control, 'pointermove', { clientX: 90, clientY: 24 });

	expect([region.start, later.start]).toEqual([100, 115]);
});

test('a kind names its marker token on the drawn part', () => {
	const { control } = mountStrip('', 'kind="loop"');

	expect(parts(control)[0]?.style.getPropertyValue('--_sonic-marker')).toContain(
		'--sonic-marker-loop',
	);
});

test.each([
	[
		'a region disabled',
		(region: SonicRegion) => {
			region.disabled = true;
		},
	],
	[
		'capture lost',
		(_region: SonicRegion, control: HTMLElement) => {
			pointerAt(control, 'lostpointercapture');
		},
	],
])(
	'%s in the middle of a drag leaves it where it was dragged, and reports the change',
	(_case, end) => {
		const { control, events, region } = mountStrip();

		pointerAt(control, 'pointerdown', { clientX: 80, clientY: 24 });
		pointerAt(control, 'pointermove', { clientX: 90, clientY: 24 });
		end(region, control);
		pointerAt(control, 'pointermove', { clientX: 120, clientY: 24 });

		expect([region.start, region.end, region.dragging]).toEqual([110, 140, false]);
		expect(events).toEqual(['input sonic-region', 'change sonic-region']);
	},
);

test('a region moved to another strip is dropped by the first and takes the second’s bounds and step', async () => {
	const { control, region, wavestrip } = mountStrip();
	const other = document.createElement('sonic-wavestrip');

	other.setAttribute('max', '120');
	other.setAttribute('step', '2');
	document.body.append(other);
	other.append(region);
	await nextTask();

	const [part] = parts(other);
	if (!part) throw new Error('The second strip did not draw the region');

	expect(parts(control)).toHaveLength(0);
	expect([part.getAttribute('aria-label'), part.getAttribute('aria-valuemax')]).toEqual([
		'Loop',
		'90',
	]);

	key(part, 'keydown', { key: 'ArrowLeft' });
	expect([region.start, region.end, wavestrip.value]).toEqual([90, 120, 50]);

	key(part, 'keydown', { key: 'ArrowLeft' });
	expect([region.start, region.end]).toEqual([88, 118]);
});

test('a strip’s value write leaves a region’s part alone, and a new formatter or bound redraws it', () => {
	const { control, wavestrip } = mountStrip();
	const [part] = parts(control);
	if (!part) throw new Error('The region was not drawn');

	const read = vi.spyOn(part, 'getAttribute');

	wavestrip.value = 80;
	expect(read).not.toHaveBeenCalled();

	wavestrip.formatSpokenValue = (seconds) => `${String(seconds)} s`;
	expect(part.getAttribute('aria-valuetext')).toBe('100 s');

	wavestrip.max = 230;
	expect([
		part.getAttribute('aria-valuemax'),
		part.style.getPropertyValue('--_sonic-region-to'),
	]).toEqual(['200', '0.5']);
});
