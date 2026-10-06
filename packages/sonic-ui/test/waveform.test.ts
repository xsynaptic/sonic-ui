import { afterEach, expect, test, vi } from 'vitest';

import type { SonicWaveform } from '#elements/waveform.ts';

import '#define/waveform.ts';

import {
	FakeIntersectionObserver,
	FakeResizeObserver,
	installCanvasFakes,
} from './canvas-fakes.ts';
import { mountControl, nextTask, pointerAt, pressKey, recordEvents } from './helpers.ts';

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

test('a promise from requestPeaks repaints and asks again when it settles, either way', async () => {
	const { flushFrames } = installCanvasFakes();
	const { waveform } = mountWaveform('max="300" step="0" value="100"');
	const settles: Array<() => void> = [];
	let asks = 0;

	waveform.requestPeaks = () => {
		asks += 1;

		return new Promise<void>((resolve, reject) => {
			settles.push(asks === 1 ? resolve : reject);
		});
	};
	flushFrames();
	flushFrames();
	expect(asks).toBe(1);

	settles[0]?.();
	await nextTask();
	flushFrames();
	expect(asks).toBe(2);

	settles[1]?.();
	await nextTask();
	flushFrames();
	expect(asks).toBe(3);
});

test('a request still out when a later one is made repaints as it settles', async () => {
	const { flushFrames } = installCanvasFakes();
	const { waveform } = mountWaveform('max="300" step="0" value="100"');
	const settles: Array<() => void> = [];
	let asks = 0;

	waveform.requestPeaks = () => {
		asks += 1;

		return asks > 2
			? undefined
			: new Promise<void>((resolve) => {
					settles.push(resolve);
				});
	};
	flushFrames();
	waveform.zoom = 35;
	flushFrames();
	expect(asks).toBe(2);

	settles[0]?.();
	await nextTask();
	flushFrames();
	expect(asks).toBe(3);
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

test('a requestPeaks that lists the same pending each call is asked once', () => {
	const { flushFrames } = installCanvasFakes();
	const { waveform } = mountWaveform('max="300" step="0" value="100"');
	let asks = 0;

	waveform.requestPeaks = () => {
		asks += 1;
		waveform.pending = [[90, 110]];
	};
	for (let frame = 0; frame < 4; frame += 1) flushFrames();

	expect(asks).toBe(1);
});

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

test('peaks written from outside the call ask again', () => {
	const { flushFrames } = installCanvasFakes();
	const { waveform } = mountWaveform('max="300" step="0" value="100"');
	let asks = 0;

	waveform.requestPeaks = () => {
		asks += 1;
	};
	flushFrames();
	flushFrames();
	waveform.peaks = { fullScale: 1, pairsPerSecond: 10, samples: new Float32Array(8) };
	flushFrames();
	flushFrames();

	expect(asks).toBe(2);
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

test('one settled promise returned on every call is asked twice, not every frame', async () => {
	const { flushFrames } = installCanvasFakes();
	const { waveform } = mountWaveform('max="300" step="0" value="100"');
	const loaded = Promise.resolve();
	let asks = 0;

	waveform.requestPeaks = () => {
		asks += 1;

		return loaded;
	};
	for (let frame = 0; frame < 4; frame += 1) {
		flushFrames();
		await nextTask();
	}

	expect(asks).toBe(2);
});

test('two promises returned together each repaint as they settle', async () => {
	const { flushFrames } = installCanvasFakes();
	const { waveform } = mountWaveform('max="300" step="0" value="100"');
	const settles: Array<() => void> = [];
	const chunks = [0, 1].map(
		() =>
			new Promise<void>((resolve) => {
				settles.push(resolve);
			}),
	);
	let asks = 0;

	waveform.requestPeaks = () => {
		asks += 1;

		return chunks;
	};
	flushFrames();
	flushFrames();
	expect(asks).toBe(1);

	for (const [index, settle] of settles.entries()) {
		settle();
		await nextTask();
		flushFrames();
		flushFrames();
		expect(asks).toBe(index + 2);
	}
});
