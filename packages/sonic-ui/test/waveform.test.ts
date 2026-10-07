import { afterEach, expect, test, vi } from 'vitest';

import type { SonicWaveform } from '#elements/waveform.ts';

import '#define/waveform.ts';

import {
	FakeIntersectionObserver,
	FakeResizeObserver,
	installCanvasFakes,
} from './canvas-fakes.ts';
import { mountControl, pointerAt, pressKey, recordEvents } from './helpers.ts';

afterEach(() => {
	document.body.replaceChildren();
});

function mountWaveform(attributes: string): { control: HTMLElement; waveform: SonicWaveform } {
	const { control, host: waveform } = mountControl('sonic-waveform', attributes);

	FakeResizeObserver.instances.at(-1)?.report([490, 96], [490, 96]);

	return { control, waveform };
}

function playheadAt(control: HTMLElement): number {
	const line = control.querySelector<HTMLElement>('.sonic-waveform-playhead');

	return Number(line?.style.getPropertyValue('translate').replace('cqi', ''));
}

test('a drag right walks back, Shift fine-tunes it, and the release changes once', () => {
	const { flushFrames } = installCanvasFakes();
	const { control, waveform } = mountWaveform('max="300" step="0" value="100"');
	const changed: Array<number> = [];

	flushFrames();
	waveform.addEventListener('change', () => {
		changed.push(waveform.value);
	});
	pointerAt(control, 'pointerdown', { clientX: 200 });
	pointerAt(control, 'pointermove', { clientX: 340 });
	expect(waveform.value).toBeCloseTo(98, 9);

	pointerAt(control, 'pointermove', { clientX: 480, shiftKey: true });
	expect(waveform.value).toBeCloseTo(97.8, 9);

	pointerAt(control, 'pointerup', { clientX: 480 });
	expect(changed).toHaveLength(1);
});

test('a drag starts from the time the last frame drew, not the value', () => {
	const { flushFrames } = installCanvasFakes();
	const { control, waveform } = mountWaveform('max="300" step="0" value="100"');

	waveform.readTime = () => 100.3;
	flushFrames();
	pointerAt(control, 'pointerdown', { clientX: 200 });
	pointerAt(control, 'pointermove', { clientX: 270 });

	expect(waveform.value).toBeCloseTo(99.3, 9);
});

test('a drag the browser cancels keeps where it went and changes', () => {
	const { flushFrames } = installCanvasFakes();
	const { control, waveform } = mountWaveform('max="300" step="0" value="100"');
	const events = recordEvents(document.body);

	flushFrames();
	pointerAt(control, 'pointerdown', { clientX: 200 });
	pointerAt(control, 'pointermove', { clientX: 340 });
	pointerAt(control, 'pointercancel', { clientX: 340 });

	expect(waveform.value).toBeCloseTo(98, 9);
	expect(events.at(-1)).toBe('change');
});

test('a frame where nothing moved writes nothing to the ghost', () => {
	const { flushFrames } = installCanvasFakes();
	const { control } = mountWaveform('max="300" playing step="0" value="100"');
	const ghost = control.querySelector<HTMLElement>('.sonic-waveform-ghost');
	if (!ghost) throw new Error('The waveform has no ghost');

	const observer = new MutationObserver(() => {
		// Read through `takeRecords`
	});

	observer.observe(ghost, { attributes: true });
	flushFrames();
	pointerAt(control, 'pointerdown', { clientX: 200 });
	pointerAt(control, 'pointermove', { clientX: 340 });
	flushFrames();
	expect(ghost.hidden).toBe(false);
	expect(observer.takeRecords().length).toBeGreaterThan(0);

	flushFrames();
	expect(observer.takeRecords()).toEqual([]);
});

test('requestPeaks asks at the current zoom, and not out of view', () => {
	const { flushFrames } = installCanvasFakes();
	const { waveform } = mountWaveform('max="300" step="0" value="100"');
	const requests: Array<[number, number]> = [];

	waveform.requestPeaks = (from, to) => {
		requests.push([from, to]);
	};
	flushFrames();
	waveform.zoom = 35;
	flushFrames();
	expect(requests.at(-1)).toEqual([79, 137]);

	const asked = requests.length;

	FakeIntersectionObserver.instances.at(-1)?.report(false);
	waveform.value = 150;
	flushFrames();
	expect(requests).toHaveLength(asked);
});

test('under reduced motion the playhead pages', () => {
	const { flushFrames } = installCanvasFakes({ isReducedMotion: true });

	const { control } = mountWaveform('max="300" step="0" value="13.9"');

	flushFrames();
	expect(playheadAt(control)).toBeCloseTo((6.9 / 7) * 100, 6);
});

function carriedAt(playbackRate: number): number {
	const { flushFrames } = installCanvasFakes({ isReducedMotion: true });
	const { control, waveform } = mountWaveform(
		`max="300" playing playback-rate="${String(playbackRate)}" step="0" value="7"`,
	);

	waveform.readTime = () => 7;
	flushFrames(1000);
	flushFrames(1100);

	return playheadAt(control);
}

test('the playback rate scales how far a frame carries the playhead past a stale source', () => {
	const atUnity = carriedAt(1);

	expect(atUnity).toBeGreaterThan(0);
	expect(carriedAt(2)).toBeCloseTo(atUnity * 2, 6);
});

test.each(['0', '-2', 'fast', 'Infinity'])(
	'a playback rate of %s falls back to 1',
	(playbackRate) => {
		const { waveform } = mountWaveform(`playback-rate="${playbackRate}"`);

		expect(waveform.playbackRate).toBe(1);
	},
);

test.each(['0', 'wide'])('a zoom of %s falls back to the default', (zoom) => {
	const { waveform } = mountWaveform(`zoom="${zoom}"`);

	expect(waveform.zoom).toBe(mountWaveform('').waveform.zoom);
});

test('Enter opens the typed entry and moves focus to it', () => {
	installCanvasFakes();

	const { control, waveform } = mountWaveform('max="300" value="100"');
	const entry = waveform.querySelector<HTMLInputElement>('.sonic-waveform-entry');

	control.focus();
	pressKey(control, 'Enter');

	expect(entry?.hidden).toBe(false);
	expect(document.activeElement).toBe(entry);
});

test('with reduced-motion="scroll" the playhead stays centerd under reduced motion', () => {
	const { flushFrames } = installCanvasFakes({ isReducedMotion: true });
	const { control, waveform } = mountWaveform(
		'max="300" reduced-motion="scroll" step="0" value="13.9"',
	);

	flushFrames();
	expect(playheadAt(control)).toBeCloseTo(50, 6);

	waveform.reducedMotion = 'page';
	flushFrames();
	expect(playheadAt(control)).toBeCloseTo((6.9 / 7) * 100, 6);
});

test('the current marker follows the value while no frame paints', () => {
	const { flushFrames } = installCanvasFakes();
	const { waveform } = mountWaveform('max="300" step="0" value="10"');
	const seen: Array<string | undefined> = [];

	document.body.addEventListener('sonic-marker', () => {
		seen.push(waveform.currentMarker?.label);
	});
	waveform.markers = [
		{ label: 'Second', start: 120 },
		{ label: 'First', start: 30 },
	];
	flushFrames();
	FakeIntersectionObserver.instances.at(-1)?.report(false);
	waveform.value = 90;
	flushFrames();
	waveform.value = 200;
	waveform.markers = [{ label: 'Late', start: 150 }];

	expect(seen).toEqual(['First', 'Second', 'Late']);
});

test('a waveform that opens out of view reports the marker it starts on', () => {
	const { flushFrames } = installCanvasFakes();
	const { waveform } = mountWaveform('max="300" step="0" value="40"');

	FakeIntersectionObserver.instances.at(-1)?.report(false);
	flushFrames();
	waveform.markers = [{ label: 'First', start: 30 }];

	expect(waveform.currentMarker?.label).toBe('First');
});

function countPaints(waveform: SonicWaveform): () => number {
	const context = waveform.querySelector('canvas')?.getContext('2d');
	if (!context) throw new Error('The waveform has no canvas context');

	const cleared = vi.spyOn(context, 'clearRect');

	return () => cleared.mock.calls.length;
}

test('a requestPeaks that assigns peaks each call is asked once, and the peaks paint', () => {
	const { flushFrames } = installCanvasFakes();
	const { waveform } = mountWaveform('max="300" step="0" value="100"');
	const paints = countPaints(waveform);
	let asks = 0;

	waveform.requestPeaks = () => {
		asks += 1;
		waveform.peaks = { fullScale: 1, pairsPerSecond: 10, samples: new Float32Array(8) };
	};
	for (let frame = 0; frame < 4; frame += 1) flushFrames();

	expect(asks).toBe(1);
	expect(paints()).toBe(2);
});

test('an unchanged pending list written from outside paints nothing', () => {
	const { flushFrames } = installCanvasFakes();
	const { waveform } = mountWaveform('max="300" step="0" value="100"');
	const paints = countPaints(waveform);

	waveform.pending = [[90, 110]];
	flushFrames();
	waveform.pending = [[90, 110]];
	flushFrames();
	expect(paints()).toBe(1);

	waveform.pending = [[90, 120]];
	flushFrames();
	expect(paints()).toBe(2);
});

function zoomEvents(waveform: SonicWaveform): Array<number> {
	const zooms: Array<number> = [];

	document.body.addEventListener('sonic-zoom', () => {
		zooms.push(waveform.zoom);
	});

	return zooms;
}

// happy-dom's WheelEvent is a UIEvent and drops the modifier keys from its init
function wheelAt(control: HTMLElement, init: WheelEventInit): WheelEvent {
	const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });

	Object.defineProperties(event, {
		ctrlKey: { value: init.ctrlKey === true },
		metaKey: { value: init.metaKey === true },
	});
	control.dispatchEvent(event);

	return event;
}

function touchAt(control: HTMLElement, type: string, [pointerId, clientX]: [number, number]): void {
	pointerAt(control, type, { clientX, pointerId, pointerType: 'touch' });
}

test('a ctrl wheel zooms, is cancelled and fires sonic-zoom; a write to zoom fires nothing', () => {
	const { control, waveform } = mountWaveform('zoomable zoom="60"');
	const zooms = zoomEvents(waveform);
	const wheel = wheelAt(control, { ctrlKey: true, deltaY: -10 });

	expect(wheel.defaultPrevented).toBe(true);
	expect(zooms).toEqual([66.31]);

	waveform.zoom = 90;
	waveform.setAttribute('zoom', '100');
	expect(zooms).toHaveLength(1);
});

test('a ctrl wheel is left to the page while zoomable is off, and zooms once it is back', () => {
	const { control, waveform } = mountWaveform('zoomable zoom="60"');
	const zooms = zoomEvents(waveform);

	waveform.zoomable = false;
	expect(wheelAt(control, { ctrlKey: true, deltaY: -10 }).defaultPrevented).toBe(false);
	expect(waveform.zoom).toBe(60);
	expect(zooms).toEqual([]);

	waveform.zoomable = true;
	wheelAt(control, { deltaY: -10, metaKey: true });
	expect(zooms).toEqual([66.31]);
});

test('a gesture stops at zoom-min and zoom-max, fires nothing once there, and brings a written zoom back inside', () => {
	const { control, waveform } = mountWaveform('zoomable zoom="150" zoom-max="160" zoom-min="30"');
	const zooms = zoomEvents(waveform);

	wheelAt(control, { ctrlKey: true, deltaY: -100 });
	wheelAt(control, { ctrlKey: true, deltaY: -100 });
	expect(zooms).toEqual([160]);

	waveform.zoom = 12;
	expect(waveform.zoom).toBe(12);
	wheelAt(control, { ctrlKey: true, deltaY: 100 });
	expect(zooms).toEqual([160, 30]);
});

test.each([
	['zoom-min="-5"', [20, 280]],
	['zoom-min="400"', [400, 400]],
	['zoom-max="0" zoom-min="35"', [35, 280]],
])('with %s the bounds are %j', (attributes, bounds) => {
	const { waveform } = mountWaveform(attributes);

	expect([waveform.zoomMin, waveform.zoomMax]).toEqual(bounds);
});

test('+ and - step the zoom and come back, firing sonic-zoom each time', () => {
	const { control, waveform } = mountWaveform('zoomable zoom="60"');
	const zooms = zoomEvents(waveform);

	expect(pressKey(control, '+').defaultPrevented).toBe(true);
	pressKey(control, '-');
	pressKey(control, '-');
	pressKey(control, '=');
	expect(zooms).toEqual([77.04, 60, 46.73, 60]);
});

test('a second finger puts the scrub back with no change, and the pinch follows the fingers from where they are', () => {
	const { flushFrames } = installCanvasFakes();
	const { control, waveform } = mountWaveform('max="300" step="0" value="100" zoom="60" zoomable');
	const events = recordEvents(document.body);
	const zooms = zoomEvents(waveform);

	flushFrames();
	touchAt(control, 'pointerdown', [1, 200]);
	touchAt(control, 'pointermove', [1, 140]);
	expect(waveform.value).toBeCloseTo(101, 9);

	touchAt(control, 'pointerdown', [2, 240]);
	expect(waveform.value).toBe(100);
	expect(waveform.dragging).toBe(false);

	touchAt(control, 'pointermove', [2, 290]);
	expect(zooms).toEqual([90]);

	touchAt(control, 'pointermove', [1, 215]);
	expect(zooms).toEqual([90, 45]);

	touchAt(control, 'pointerup', [1, 215]);
	touchAt(control, 'pointerup', [2, 290]);
	expect(waveform.value).toBe(100);
	expect(events).not.toContain('change');
});

test('with no formatter set, a waveform shows, types and speaks a clock', () => {
	installCanvasFakes();
	document.body.lang = 'en';

	const { control, waveform } = mountWaveform('max="300" step="0" value="83.47"');
	const entry = control.querySelector('input');

	pressKey(control, 'Enter');
	if (entry) entry.value = '2:05';
	if (entry) pressKey(entry, 'Enter');

	expect(waveform.value).toBe(125);
	expect(waveform.valueText).toBe('2:05');
	expect(control.getAttribute('aria-valuetext')).toBe('2 minutes, 5 seconds');
	document.body.removeAttribute('lang');
});

function arrowRight(control: HTMLElement, type: string, isRepeat: boolean): void {
	control.dispatchEvent(
		new KeyboardEvent(type, {
			bubbles: true,
			cancelable: true,
			key: 'ArrowRight',
			repeat: isRepeat,
		}),
	);
}

test('a repeating key scrubs: input alone on each repeat, then one change on keyup', () => {
	const { flushFrames } = installCanvasFakes();
	const { control, waveform } = mountWaveform('max="300" key-step="5" value="100"');
	const events = recordEvents(document.body);

	flushFrames();
	arrowRight(control, 'keydown', false);
	arrowRight(control, 'keydown', true);
	arrowRight(control, 'keydown', true);
	expect(events).toEqual(['input', 'change', 'input', 'input']);

	arrowRight(control, 'keyup', false);
	expect(events).toEqual(['input', 'change', 'input', 'input', 'change']);
	expect(waveform.value).toBe(115);
});

test('a key scrub draws the playhead at the scrubbed value and the ghost where playback is', () => {
	const { flushFrames } = installCanvasFakes();
	const { control, waveform } = mountWaveform('max="300" key-step="0.5" step="0" value="100"');
	const ghost = control.querySelector<HTMLElement>('.sonic-waveform-ghost');

	waveform.markers = [{ label: 'Drop', start: 100.3 }];
	flushFrames();
	expect(waveform.currentMarker).toBeUndefined();

	arrowRight(control, 'keydown', true);
	flushFrames();
	expect(waveform.currentMarker?.label).toBe('Drop');
	expect(playheadAt(control)).toBe(50);
	expect(ghost?.hidden).toBe(false);

	arrowRight(control, 'keyup', false);
	flushFrames();
	expect(ghost?.hidden).toBe(true);
});
