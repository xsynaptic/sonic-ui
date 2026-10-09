import { afterEach, expect, test, vi } from 'vitest';

import type { SonicWavestrip } from '#elements/wavestrip.ts';

import '#define/wavestrip.ts';

import { FakeResizeObserver, installCanvasFakes } from './canvas-fakes.ts';
import { mountControl, pointerAt, recordEvents } from './helpers.ts';

afterEach(() => {
	document.body.replaceChildren();
	document.body.removeAttribute('lang');
});

function mountWavestrip(attributes: string): {
	canvas: HTMLCanvasElement;
	control: HTMLElement;
	wavestrip: SonicWavestrip;
} {
	const { control, host: wavestrip } = mountControl('sonic-wavestrip', attributes);
	const canvas = control.querySelector('canvas');
	if (!canvas) throw new Error('The wavestrip has no canvas');

	const box = new DOMRect(0, 0, 300, 48);

	vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(box);
	vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(box);
	FakeResizeObserver.instances.at(-1)?.report([300, 48], [300, 48]);

	return { canvas, control, wavestrip };
}

function midPointerAt(control: HTMLElement, type: string, init: PointerEventInit): void {
	pointerAt(control, type, { clientY: 24, ...init });
}

function keyAt(target: HTMLElement, type: string, isRepeat: boolean): void {
	target.dispatchEvent(
		new KeyboardEvent(type, {
			bubbles: true,
			cancelable: true,
			key: 'ArrowRight',
			repeat: isRepeat,
		}),
	);
}

function readoutText(control: HTMLElement): string {
	return control.querySelector(':scope > .sonic-wavestrip-readout > span')?.textContent ?? '';
}

test('a repeating key scrubs and holds writes, then changes once on keyup', () => {
	installCanvasFakes();

	const { canvas, wavestrip } = mountWavestrip('max="300" key-step="5" value="60"');
	const events = recordEvents(document.body);

	keyAt(canvas, 'keydown', true);
	wavestrip.value = 10;
	keyAt(canvas, 'keydown', true);
	keyAt(canvas, 'keydown', true);
	expect(events).toEqual(['input', 'input', 'input']);
	expect(wavestrip.value).toBe(75);

	keyAt(canvas, 'keyup', false);
	expect(events).toEqual(['input', 'input', 'input', 'change']);
});

test('a key scrub that loses focus changes once, and its keyup adds nothing', () => {
	installCanvasFakes();

	const { canvas } = mountWavestrip('max="300" key-step="5" value="60"');
	const events = recordEvents(document.body);

	keyAt(canvas, 'keydown', true);
	keyAt(canvas, 'keydown', true);
	canvas.dispatchEvent(new FocusEvent('blur'));
	keyAt(canvas, 'keyup', false);

	expect(events).toEqual(['input', 'input', 'change']);
});

test('a single key press changes at once', () => {
	installCanvasFakes();

	const { canvas } = mountWavestrip('max="300" key-step="5" value="60"');
	const events = recordEvents(document.body);

	keyAt(canvas, 'keydown', false);

	expect(events).toEqual(['input', 'change']);
});

test('with cancellable, a drag far off the strip returns to its start and resumes on return', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip(
		'cancellable min="30" max="330" step="0" value="50"',
	);
	const events = recordEvents(document.body);
	const values: Array<number> = [];

	midPointerAt(control, 'pointerdown', { clientX: 150 });
	for (const [clientX, clientY] of [
		[150, 108],
		[100, 24],
		[100, -60],
		[80, -70],
	] as const) {
		midPointerAt(control, 'pointermove', { clientX, clientY });
		values.push(wavestrip.value);
	}
	midPointerAt(control, 'pointerup', { clientX: 80, clientY: -70 });

	expect(values).toEqual([50, 130, 50, 50]);
	expect(events).not.toContain('change');
});

test('without cancellable, the same drag keeps scrubbing and changes on release', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330" step="0" value="50"');
	const events = recordEvents(document.body);

	midPointerAt(control, 'pointerdown', { clientX: 150 });
	midPointerAt(control, 'pointermove', { clientX: 150, clientY: 108 });
	midPointerAt(control, 'pointerup', { clientX: 150, clientY: 108 });

	expect(wavestrip.value).toBe(180);
	expect(events).toEqual(['input', 'change']);
});

test('a mouse over the strip reads out the time under it, or a marker within reach', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('readout min="30" max="330" step="0" value="30"');

	wavestrip.formatValue = (seconds) => `${String(seconds)} s`;
	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'touch' });
	expect(readoutText(control)).toBe('');

	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'mouse' });
	expect(readoutText(control)).toBe('105 s');

	wavestrip.markers = [{ start: 200 }];
	midPointerAt(control, 'pointermove', { clientX: 172, clientY: 2, pointerType: 'mouse' });
	expect(readoutText(control)).toBe('200 s');
});

test.each([
	['a button held', 'readout', { buttons: 1 }],
	['no readout', '', {}],
])('with %s, a mouse over the strip reads out nothing', (_case, attributes, init) => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip(
		`${attributes} min="30" max="330" step="0" value="30"`,
	);

	wavestrip.formatValue = (seconds) => `${String(seconds)} s`;
	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'mouse', ...init });

	expect(readoutText(control)).toBe('');
	expect(control.style.getPropertyValue('--_sonic-wavestrip-readout-at')).toBe('0');
});

test('a disabled strip still reads out under a mouse, and a press moves nothing', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip(
		'readout disabled min="30" max="330" step="0" value="30"',
	);
	const events = recordEvents(document.body);

	wavestrip.formatValue = (seconds) => `${String(seconds)} s`;
	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'mouse' });
	expect(readoutText(control)).toBe('105 s');

	midPointerAt(control, 'pointerdown', { clientX: 150, pointerType: 'mouse' });
	midPointerAt(control, 'pointerup', { clientX: 150, pointerType: 'mouse' });
	expect(wavestrip.value).toBe(30);
	expect(events).toEqual([]);
});

test('a press and a hover between two pixels land between them', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('readout min="30" max="330" step="0" value="30"');

	wavestrip.formatValue = (seconds) => `${String(seconds)} s`;
	midPointerAt(control, 'pointermove', { clientX: 75.25, pointerType: 'mouse' });
	expect(readoutText(control)).toBe('105.25 s');

	midPointerAt(control, 'pointerdown', { clientX: 150.8, pointerType: 'mouse' });
	expect(wavestrip.value).toBeCloseTo(180.8, 9);
});

test("a drag's reveal takes the readout from the hover", () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('readout min="30" max="330" step="0" value="30"');

	wavestrip.formatValue = (seconds) => `${String(seconds)} s`;
	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'mouse' });
	midPointerAt(control, 'pointerdown', { clientX: 150, pointerType: 'mouse' });
	midPointerAt(control, 'pointermove', { clientX: 200, pointerType: 'mouse' });

	expect(readoutText(control)).toBe('230 s');
});

test('a max written during a drag keeps the dragged value', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="230" step="0" value="50"');
	const changed: Array<number> = [];

	wavestrip.addEventListener('change', () => {
		changed.push(wavestrip.value);
	});
	midPointerAt(control, 'pointerdown', { clientX: 150 });
	wavestrip.max = 230.5;
	midPointerAt(control, 'pointerup', { clientX: 150 });

	expect(changed).toEqual([130]);
});

function markerParts(control: HTMLElement): Array<HTMLElement> {
	return [
		...control.querySelectorAll<HTMLElement>(
			':is(.sonic-wavestrip-marker, .sonic-wavestrip-region)',
		),
	];
}

// The reach is 4px, since happy-dom computes no marker size
test.each([
	[172, 2, 200],
	[176, 2, 206],
	[172, 8, 202],
])('a press at %ipx, %ipx by a marker at 170px, 0px lands at %d', (clientX, clientY, expected) => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330" step="0" value="50"');

	wavestrip.markers = [{ start: 200 }];
	midPointerAt(control, 'pointerdown', { clientX, clientY });

	expect(wavestrip.value).toBe(expected);
});

test('a drag from a marker scrubs from the press, and crossing the marker never snaps to it', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330" step="0" value="50"');
	const values: Array<number> = [];

	wavestrip.markers = [{ start: 200 }];
	midPointerAt(control, 'pointerdown', { clientX: 172, clientY: 2 });
	for (const clientX of [176, 168]) {
		midPointerAt(control, 'pointermove', { clientX, clientY: 2 });
		values.push(wavestrip.value);
	}

	expect(values).toEqual([206, 198]);
});

test('a marker sits at its proportion between the bounds', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330"');

	wavestrip.markers = [{ end: 255, start: 105 }];

	const [region] = markerParts(control);

	expect(region?.style.getPropertyValue('--_sonic-marker-from')).toBe('0.25');
	expect(region?.style.getPropertyValue('--_sonic-marker-to')).toBe('0.75');
});

test('the band holds one part per marker in the order `markers` reads back', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330" step="0" value="50"');

	wavestrip.markers = [{ start: 200 }, { end: 150, start: 100 }, { start: 50 }];

	expect(
		markerParts(control).map((part) => [
			part.className,
			Number(part.style.getPropertyValue('--_sonic-marker-from')) * 300 + 30,
		]),
	).toEqual([
		['sonic-wavestrip-marker', 50],
		['sonic-wavestrip-region', 100],
		['sonic-wavestrip-marker', 200],
	]);
});

test('a value write leaves the marker parts as they were built', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('max="300" value="10"');

	wavestrip.markers = [{ start: 60 }, { end: 120, kind: 'loop', start: 90 }];

	const built = markerParts(control);

	wavestrip.value = 200;

	const after = markerParts(control);

	// `toEqual` compares nodes by markup, which a rebuild matches
	expect(after.map((part, index) => part === built[index])).toEqual([true, true]);
});

function mountLanedWavestrip(): { control: HTMLElement; wavestrip: SonicWavestrip } {
	const mounted = mountWavestrip('min="30" max="330" step="0" value="50"');

	const band = mounted.control.querySelector<HTMLElement>('.sonic-wavestrip-markers');

	// happy-dom computes an inline custom property on its own element only
	band?.style.setProperty('--_sonic-marker-size', '2px');
	band?.style.setProperty('--_sonic-marker-step', '2px');

	return mounted;
}

test('markersFromPoint lists a cluster across lanes nearest first, and a press there seeks to the first', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountLanedWavestrip();
	const point = { clientX: 170.25, clientY: 5 };

	wavestrip.markers = [199, 199.5, 200, 200.5, 201, 240].map((start) => ({
		cue: `cue-${String(start)}`,
		start,
	}));

	const found = wavestrip.markersFromPoint(point.clientX, point.clientY);

	expect(found.map(({ cue }) => cue)).toEqual([
		'cue-200',
		'cue-200.5',
		'cue-199.5',
		'cue-201',
		'cue-199',
	]);

	pointerAt(control, 'pointerdown', point);
	expect(wavestrip.value).toBe(found[0]?.start);
});

test('markersFromPoint lists a region after every point marker, only where its span is painted', () => {
	installCanvasFakes();

	const { wavestrip } = mountLanedWavestrip();

	wavestrip.markers = [
		{ end: 260, label: 'Loop', start: 190 },
		{ label: 'Point', start: 202 },
		{ end: 300, label: 'Later', start: 280 },
	];

	const labels = (clientX: number, clientY: number): Array<string | undefined> =>
		wavestrip.markersFromPoint(clientX, clientY).map(({ label }) => label);

	expect(labels(170, 1)).toEqual(['Point', 'Loop']);
	expect(labels(170, 40)).toEqual(['Loop']);
	expect(labels(160, 40)).toEqual(['Loop']);
	expect(labels(159, 40)).toEqual([]);
	expect(labels(231, 40)).toEqual([]);
	expect(labels(240, 40)).toEqual([]);
	expect(labels(170, -1)).toEqual([]);
	expect(labels(170, 49)).toEqual([]);
});

function recordDrawn(wavestrip: SonicWavestrip): Array<[unknown, HTMLElement, boolean]> {
	const drawn: Array<[unknown, HTMLElement, boolean]> = [];

	wavestrip.renderMarker = (marker, element) => {
		element.textContent = String(marker.cue);
		drawn.push([marker.cue, element, element.isConnected]);
	};

	return drawn;
}

test('renderMarker is given each point marker with its own detached element, and a region is left alone', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330"');
	const drawn = recordDrawn(wavestrip);

	wavestrip.markers = [
		{ cue: 'late', start: 200 },
		{ cue: 'span', end: 150, start: 100 },
		{ cue: 'early', start: 50 },
	];

	expect(drawn.map(([cue, , isConnected]) => [cue, isConnected])).toEqual([
		['early', false],
		['late', false],
	]);
	expect(markerParts(control).map((part) => [part.className, part.textContent])).toEqual([
		['sonic-wavestrip-marker', 'early'],
		['sonic-wavestrip-region', ''],
		['sonic-wavestrip-marker', 'late'],
	]);
});

test('a resize, a bound write and a reconnect keep the elements a renderer was handed, and place them', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330"');
	const drawn = recordDrawn(wavestrip);

	wavestrip.markers = [
		{ cue: 'one', start: 105 },
		{ cue: 'two', start: 180 },
	];

	const built = markerParts(control);

	FakeResizeObserver.instances.at(-1)?.report([200, 48], [200, 48]);
	wavestrip.max = 180;
	wavestrip.remove();
	document.body.append(wavestrip);
	FakeResizeObserver.instances.at(-1)?.report([300, 48], [300, 48]);

	expect(drawn).toHaveLength(2);
	expect(markerParts(control).map((part, index) => part === built[index])).toEqual([true, true]);
	expect(built.map((part) => part.style.getPropertyValue('--_sonic-marker-from'))).toEqual([
		'0.5',
		'1',
	]);
});

test('a markers write of the same content and a renderMarker write each draw every point marker afresh', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330"');
	const drawn = recordDrawn(wavestrip);
	const render = wavestrip.renderMarker;

	wavestrip.markers = [
		{ cue: 'one', start: 105 },
		{ cue: 'two', start: 180 },
	];

	const sameContent = wavestrip.markers;

	wavestrip.markers = sameContent;
	wavestrip.renderMarker = render;

	expect(drawn.map(([cue, , isConnected]) => [cue, isConnected])).toEqual(
		Array.from({ length: 3 }, () => [
			['one', false],
			['two', false],
		]).flat(),
	);
	expect(new Set(drawn.map(([, element]) => element)).size).toBe(6);
	expect(markerParts(control).map((part, index) => part === drawn[index + 4]?.[1])).toEqual([
		true,
		true,
	]);
});

test('clearing renderMarker brings back markers that paint themselves', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330"');

	wavestrip.markers = [{ cue: 'one', start: 50 }];
	recordDrawn(wavestrip);
	expect(markerParts(control)[0]?.style.getPropertyValue('--_sonic-marker-paint')).toBe(
		'transparent',
	);

	wavestrip.renderMarker = undefined;

	const [plain] = markerParts(control);

	expect(plain?.textContent).toBe('');
	expect(plain?.style.getPropertyValue('--_sonic-marker-paint')).toBe('');
});

test('a kind names its token, and a kind that is not a plain name draws in the default colour', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('');

	wavestrip.markers = [
		{ kind: 'loop', start: 20 },
		{ kind: 'x);background:red', start: 40 },
	];

	const [loop, hostile] = markerParts(control);

	expect(loop?.style.getPropertyValue('--_sonic-marker')).toContain('--sonic-marker-loop');
	expect(hostile?.style.getPropertyValue('--_sonic-marker')).toBe('');
	expect(hostile?.style.cssText).not.toContain('red');
});

test('Escape dismisses a hovered readout without focus, until the pointer leaves and returns', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('readout min="30" max="330" step="0" value="30"');
	wavestrip.formatValue = (seconds) => `${String(seconds)} s`;
	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'mouse' });
	expect(readoutText(control)).toBe('105 s');

	document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
	midPointerAt(control, 'pointermove', { clientX: 90, pointerType: 'mouse' });
	expect(readoutText(control)).toBe('105 s');

	midPointerAt(control, 'pointerleave', { pointerType: 'mouse' });
	midPointerAt(control, 'pointermove', { clientX: 90, pointerType: 'mouse' });
	expect(readoutText(control)).toBe('120 s');
});

test('with no readout, the hovered value is public and reports each change once', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330" step="0" value="30"');
	const hovered: Array<number | undefined> = [];

	document.body.addEventListener('sonic-hover', () => {
		hovered.push(wavestrip.hoverValue);
	});
	wavestrip.markers = [{ start: 200 }];

	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'touch' });
	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'mouse' });
	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'mouse' });
	midPointerAt(control, 'pointermove', { clientX: 172, clientY: 2, pointerType: 'mouse' });
	midPointerAt(control, 'pointerleave', { pointerType: 'mouse' });
	midPointerAt(control, 'pointerleave', { pointerType: 'mouse' });

	expect(hovered).toEqual([105, 200, undefined]);
	expect(wavestrip.value).toBe(30);
});

test('Escape and a press each drop the hovered value once, and the drag after stays quiet', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330" step="0" value="30"');
	const hovered: Array<number | undefined> = [];

	document.body.addEventListener('sonic-hover', () => {
		hovered.push(wavestrip.hoverValue);
	});

	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'mouse' });
	document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
	midPointerAt(control, 'pointermove', { clientX: 90, pointerType: 'mouse' });
	expect(hovered).toEqual([105, undefined]);

	midPointerAt(control, 'pointerleave', { pointerType: 'mouse' });
	midPointerAt(control, 'pointermove', { clientX: 90, pointerType: 'mouse' });
	midPointerAt(control, 'pointerdown', { clientX: 90, pointerType: 'mouse' });
	midPointerAt(control, 'pointermove', { buttons: 1, clientX: 150, pointerType: 'mouse' });
	midPointerAt(control, 'pointermove', { buttons: 1, clientX: 200, pointerType: 'mouse' });
	expect(hovered).toEqual([105, undefined, 120, undefined]);
});

test('a release under a still mouse brings the hovered value back, and a touch release does not', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330" step="0" value="30"');
	const hovered: Array<number | undefined> = [];

	document.body.addEventListener('sonic-hover', () => {
		hovered.push(wavestrip.hoverValue);
	});

	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'mouse' });
	midPointerAt(control, 'pointerdown', { clientX: 75, pointerType: 'mouse' });
	midPointerAt(control, 'pointermove', { buttons: 1, clientX: 150, pointerType: 'mouse' });
	midPointerAt(control, 'pointerup', { clientX: 150, pointerType: 'mouse' });
	expect(hovered).toEqual([105, undefined, 180]);

	midPointerAt(control, 'pointerleave', { pointerType: 'mouse' });
	midPointerAt(control, 'pointerdown', { clientX: 90, pointerType: 'touch' });
	midPointerAt(control, 'pointerup', { clientX: 90, pointerType: 'touch' });
	expect(wavestrip.hoverValue).toBeUndefined();
});

test('a release off the strip leaves the hovered value alone', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip(
		'cancellable min="30" max="330" step="0" value="30"',
	);
	const hovered: Array<number | undefined> = [];

	midPointerAt(control, 'pointerdown', { clientX: 75, pointerType: 'mouse' });
	document.body.addEventListener('sonic-hover', () => {
		hovered.push(wavestrip.hoverValue);
	});
	midPointerAt(control, 'pointermove', { buttons: 1, clientX: 150, pointerType: 'mouse' });
	midPointerAt(control, 'pointermove', {
		buttons: 1,
		clientX: 150,
		clientY: 168,
		pointerType: 'mouse',
	});
	midPointerAt(control, 'pointerup', { clientX: 150, clientY: 168, pointerType: 'mouse' });

	expect(wavestrip.value).toBe(30);
	expect(hovered).toEqual([]);
});

function readoutAt(control: HTMLElement): string {
	return control.style.getPropertyValue('--_sonic-wavestrip-readout-at');
}

test('a key reveal takes the readout from a hover, which returns under a still pointer when it lapses', () => {
	installCanvasFakes();
	vi.useFakeTimers();

	const { canvas, control } = mountWavestrip(
		'readout min="30" max="330" step="0" key-step="30" value="30"',
	);

	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'mouse' });
	expect(readoutAt(control)).toBe('0.25');

	keyAt(canvas, 'keydown', false);
	keyAt(canvas, 'keyup', false);
	expect(readoutAt(control)).toBe('0.1');

	vi.runAllTimers();
	vi.useRealTimers();
	expect(readoutAt(control)).toBe('0.25');

	midPointerAt(control, 'pointermove', { clientX: 150, pointerType: 'mouse' });
	expect(readoutAt(control)).toBe('0.5');
});

test('typed entry drops a hover, and a pointer moving while it is open brings none back', () => {
	installCanvasFakes();

	const { canvas, control } = mountWavestrip('readout min="30" max="330" step="0" value="60"');
	const entry = control.querySelector('input');
	if (!entry) throw new Error('The wavestrip has no entry');

	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'mouse' });
	canvas.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }),
	);
	midPointerAt(control, 'pointermove', { clientX: 150, pointerType: 'mouse' });
	entry.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }),
	);

	expect(readoutAt(control)).toBe('0.1');
});

function scrubKey(target: HTMLElement, type: string, key: string): void {
	target.dispatchEvent(
		new KeyboardEvent(type, { bubbles: true, cancelable: true, key, repeat: type === 'keydown' }),
	);
}

test('disabling mid-scrub changes once and ends the hold', () => {
	installCanvasFakes();

	const { canvas, wavestrip } = mountWavestrip('max="300" key-step="5" value="60"');
	const events = recordEvents(document.body);

	scrubKey(canvas, 'keydown', 'ArrowRight');
	wavestrip.disabled = true;
	expect(events).toEqual(['input', 'change']);

	scrubKey(canvas, 'keyup', 'ArrowRight');
	wavestrip.value = 10;
	expect(events).toEqual(['input', 'change']);
	expect(wavestrip.value).toBe(10);
});

test('switching key mid-scrub changes for the first key, then scrubs from there with the second', () => {
	installCanvasFakes();

	const { canvas, wavestrip } = mountWavestrip('max="300" key-step="5" value="60"');
	const events = recordEvents(document.body);

	scrubKey(canvas, 'keydown', 'ArrowRight');
	scrubKey(canvas, 'keydown', 'ArrowRight');
	scrubKey(canvas, 'keydown', 'ArrowLeft');
	expect(events).toEqual(['input', 'input', 'change', 'input']);

	scrubKey(canvas, 'keyup', 'ArrowRight');
	expect(events).toHaveLength(4);

	scrubKey(canvas, 'keydown', 'ArrowLeft');
	scrubKey(canvas, 'keydown', 'ArrowLeft');
	scrubKey(canvas, 'keyup', 'ArrowLeft');
	expect(wavestrip.value).toBe(55);
	expect(events.slice(4)).toEqual(['input', 'input', 'change']);
});

test('with double-press="none", two presses on one spot seek twice and Enter still opens the entry', () => {
	installCanvasFakes();

	const { canvas, control, wavestrip } = mountWavestrip(
		'double-press="none" min="30" max="330" step="0" value="50"',
	);
	const entry = control.querySelector<HTMLInputElement>('.sonic-wavestrip-entry');
	const events = recordEvents(document.body);

	for (const clientX of [150, 150]) {
		midPointerAt(control, 'pointerdown', { clientX });
		midPointerAt(control, 'pointerup', { clientX });
		wavestrip.value = 50;
	}
	expect(entry?.hidden).toBe(true);
	expect(events).toEqual(['input', 'change', 'input', 'change']);

	midPointerAt(control, 'pointerdown', { clientX: 150 });
	midPointerAt(control, 'pointermove', { clientX: 200 });
	expect(wavestrip.value).toBe(230);

	midPointerAt(control, 'pointerup', { clientX: 200 });
	canvas.focus();
	canvas.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }),
	);
	expect(entry?.hidden).toBe(false);
});

function revealTrace(wavestrip: SonicWavestrip): Array<string> {
	const trace: Array<string> = [];

	for (const type of ['input', 'sonic-reveal']) {
		document.body.addEventListener(type, () => {
			trace.push(`${type}:${String(wavestrip.value)}`);
		});
	}

	return trace;
}

test('a touch held still reveals after the hold time, and reports its pointer type until release', () => {
	vi.useFakeTimers();
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330" step="0" value="50"');

	const pressedBy: Array<string | undefined> = [];

	document.body.addEventListener('input', () => {
		pressedBy.push(wavestrip.pointerType);
	});
	midPointerAt(control, 'pointerdown', { clientX: 150, pointerType: 'touch' });

	const trace = revealTrace(wavestrip);

	expect(pressedBy).toEqual(['touch']);
	expect(wavestrip.pointerType).toBe('touch');
	vi.advanceTimersByTime(249);
	expect(trace).toEqual([]);
	vi.advanceTimersByTime(1);
	expect(trace).toEqual(['sonic-reveal:180']);

	midPointerAt(control, 'pointerup', { clientX: 150, pointerType: 'touch' });
	expect(trace).toEqual(['sonic-reveal:180', 'sonic-reveal:180']);
	expect(wavestrip.pointerType).toBeUndefined();
	vi.useRealTimers();
});

test('a release reports its pointer type through its change, then drops it', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330" step="0" value="50"');
	const committedBy: Array<string | undefined> = [];

	document.body.addEventListener('change', () => {
		committedBy.push(wavestrip.pointerType);
	});
	midPointerAt(control, 'pointerdown', { clientX: 150, pointerType: 'pen' });
	midPointerAt(control, 'pointerup', { clientX: 150, pointerType: 'pen' });

	expect(committedBy).toEqual(['pen']);
	expect(wavestrip.pointerType).toBeUndefined();
});

test('leaving the cancel zone ends the reveal before the value returns, and coming back restores it', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip(
		'cancellable min="30" max="330" step="0" value="50"',
	);

	midPointerAt(control, 'pointerdown', { clientX: 150 });

	const trace = revealTrace(wavestrip);

	midPointerAt(control, 'pointermove', { clientX: 100 });
	midPointerAt(control, 'pointermove', { clientX: 100, clientY: -60 });
	midPointerAt(control, 'pointermove', { clientX: 100 });

	expect(trace).toEqual([
		'sonic-reveal:180',
		'input:130',
		'sonic-reveal:130',
		'input:50',
		'input:130',
		'sonic-reveal:130',
	]);
});

test('the gesture reads as properties through a press, a scrub, the cancel zone and a release', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip(
		'cancellable min="30" max="330" step="0" value="50"',
	);
	const phases: Array<string> = [];
	const step = (type: string, init: PointerEventInit): void => {
		midPointerAt(control, type, init);
		phases.push(
			(['dragging', 'revealed', 'cancelling'] as const).filter((name) => wavestrip[name]).join(' '),
		);
	};

	step('pointerdown', { clientX: 150 });
	step('pointermove', { clientX: 100 });
	step('pointermove', { clientX: 100, clientY: -60 });
	step('pointermove', { clientX: 100 });
	step('pointerup', { clientX: 100 });

	expect(phases).toEqual([
		'dragging',
		'dragging revealed',
		'dragging cancelling',
		'dragging revealed',
		'',
	]);
});

test('a key reveals before its input, and the reveal ends once, a second after the last key', () => {
	vi.useFakeTimers();
	installCanvasFakes();

	const { canvas, wavestrip } = mountWavestrip(
		'min="30" max="330" step="0" key-step="30" value="50"',
	);
	const trace = revealTrace(wavestrip);

	keyAt(canvas, 'keydown', false);
	vi.advanceTimersByTime(600);
	keyAt(canvas, 'keydown', false);
	vi.advanceTimersByTime(999);
	expect(trace).toEqual(['sonic-reveal:50', 'input:80', 'input:110']);

	vi.advanceTimersByTime(1);
	expect(trace).toEqual(['sonic-reveal:50', 'input:80', 'input:110', 'sonic-reveal:110']);
	vi.useRealTimers();
});

test('a pointer that cannot be captured still drags and changes on release', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330" step="0" value="50"');
	const events = recordEvents(document.body);

	vi.spyOn(control, 'setPointerCapture').mockImplementation(() => {
		throw new DOMException('No active pointer', 'NotFoundError');
	});
	midPointerAt(control, 'pointerdown', { clientX: 150, pointerType: 'pen' });
	expect(wavestrip.pointerType).toBe('pen');

	midPointerAt(control, 'pointermove', { clientX: 100 });
	midPointerAt(control, 'pointerup', { clientX: 100 });

	expect(wavestrip.value).toBe(130);
	expect(events.at(-1)).toBe('change');
});

test('spoken-step rounds aria-valuenow to its multiples and leaves the value alone', () => {
	installCanvasFakes();

	const { canvas, wavestrip } = mountWavestrip('max="300" step="0" spoken-step="0.5" value="61.3"');

	expect(canvas.getAttribute('aria-valuenow')).toBe('61.5');
	expect(wavestrip.value).toBe(61.3);

	wavestrip.spokenStep = undefined;
	expect(canvas.getAttribute('aria-valuenow')).toBe('61.3');
});

test('formatSpokenValue is given the value spoken-step rounded, so the text agrees with aria-valuenow', () => {
	installCanvasFakes();

	const { canvas, wavestrip } = mountWavestrip('max="300" step="0" spoken-step="0.5" value="61.3"');

	wavestrip.formatSpokenValue = (value) => `${String(value)} seconds`;
	expect(canvas.getAttribute('aria-valuetext')).toBe('61.5 seconds');

	wavestrip.spokenStep = undefined;
	expect(canvas.getAttribute('aria-valuetext')).toBe('61.3 seconds');
});

test('the current marker follows playback, and reports only when it changes', () => {
	installCanvasFakes();

	const { wavestrip } = mountWavestrip('max="300" step="0" value="10"');
	const seen: Array<string | undefined> = [];

	document.body.addEventListener('sonic-marker', () => {
		seen.push(wavestrip.currentMarker?.label);
	});
	wavestrip.markers = [
		{ label: 'Second', start: 120 },
		{ label: 'First', start: 30 },
	];
	expect(wavestrip.currentMarker).toBeUndefined();

	wavestrip.value = 30;
	wavestrip.value = 90;
	wavestrip.value = 200;
	wavestrip.value = 20;

	expect(seen).toEqual(['First', 'Second', undefined]);
});

test('clientXOf places a value along the canvas, clamped to the bounds', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330" step="0" value="30"');
	const canvas = control.querySelector('canvas');
	if (!canvas) throw new Error('The wavestrip has no canvas');

	vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 0, 200, 48));

	expect(wavestrip.clientXOf(105)).toBeCloseTo(90, 9);
	expect(wavestrip.clientXOf(500)).toBeCloseTo(240, 9);
});

test('valueFromPoint undoes clientXOf without snapping to the step, and clamps a point past the box', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330" step="7" value="30"');
	const canvas = control.querySelector('canvas');
	if (!canvas) throw new Error('The wavestrip has no canvas');

	vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 0, 200, 48));

	expect(wavestrip.valueFromPoint(90, 24)).toBeCloseTo(105, 9);
	for (const clientX of [40, 90, 173.5]) {
		expect(wavestrip.clientXOf(wavestrip.valueFromPoint(clientX, 24))).toBeCloseTo(clientX, 9);
	}
	expect(wavestrip.valueFromPoint(0, 24)).toBe(30);
	expect(wavestrip.valueFromPoint(400, 24)).toBe(324);
});

test('a preview paints as a scrub from the played edge, repaints only when it moves, and gives way to a hold', () => {
	const { flushFrames } = installCanvasFakes();
	const { canvas, control, wavestrip } = mountWavestrip('min="30" max="330" step="0" value="50"');
	const context = canvas.getContext('2d');
	if (!context) throw new Error('The wavestrip has no canvas context');

	const clipped = vi.spyOn(context, 'rect');
	const spans = (): Array<[number, number]> => {
		flushFrames();

		const drawn = clipped.mock.calls.map(([from, , width]): [number, number] => [from, width]);

		clipped.mockClear();

		return drawn;
	};

	wavestrip.peaks = [0.5, 1];
	expect(spans()).toEqual([[0, 20]]);

	wavestrip.preview = 130;
	expect(spans()).toEqual([
		[0, 20],
		[20, 80],
	]);
	expect([wavestrip.value, canvas.getAttribute('aria-valuenow')]).toEqual([50, '50']);

	wavestrip.preview = 130.2;
	expect(spans()).toEqual([]);

	midPointerAt(control, 'pointerdown', { clientX: 150 });
	midPointerAt(control, 'pointermove', { clientX: 200 });
	expect(spans()).toEqual([
		[0, 20],
		[20, 180],
	]);

	midPointerAt(control, 'pointerup', { clientX: 200 });
	wavestrip.preview = undefined;
	expect(spans()).toEqual([[0, 200]]);
});

function openEntry(control: HTMLElement): HTMLInputElement {
	const entry = control.querySelector('input');
	if (!entry) throw new Error('The wavestrip has no entry');

	control
		.querySelector('canvas')
		?.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }),
		);

	return entry;
}

function commitEntry(entry: HTMLInputElement, text: string): void {
	entry.value = text;
	entry.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }),
	);
}

test('with no formatter set, a strip shows, types and speaks a clock in the language around it', () => {
	installCanvasFakes();
	document.body.lang = 'en';

	const { canvas, control, wavestrip } = mountWavestrip('max="4000" step="0" value="83.47"');
	const events = recordEvents(document.body);

	expect(wavestrip.valueText).toBe('1:23');
	expect(canvas.getAttribute('aria-valuetext')).toBe('1 minute, 23 seconds');
	expect([wavestrip.formatValue, wavestrip.parseValue, wavestrip.formatSpokenValue]).toEqual([
		undefined,
		undefined,
		undefined,
	]);

	const entry = openEntry(control);

	expect(entry.value).toBe('1:23');

	commitEntry(entry, '1:23');
	expect(wavestrip.value).toBe(83.47);
	expect(events).toEqual([]);

	commitEntry(openEntry(control), '1:02:05');
	expect(wavestrip.value).toBe(3725);
	expect(events).toEqual(['input', 'change']);
	expect(canvas.getAttribute('aria-valuetext')).toBe('1 hour, 2 minutes, 5 seconds');
});

test.each(['', '1:', 'abc'])('an entry left as %j changes nothing', (typed) => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('max="300" step="0" value="83.47"');
	const events = recordEvents(document.body);

	commitEntry(openEntry(control), typed);

	expect(wavestrip.value).toBe(83.47);
	expect(events).toEqual([]);
});

test('a strip with nothing set at all writes a whole clock, and speaks zero as seconds', () => {
	installCanvasFakes();
	document.body.lang = 'en';

	const { canvas, control, wavestrip } = mountWavestrip('');

	expect(wavestrip.valueText).toBe('0:00');
	expect(canvas.getAttribute('aria-valuetext')).toBe('0 seconds');
	expect(openEntry(control).value).toBe('0:00');
});

test('the spoken clock follows the nearest lang, and an unreadable one falls back to the browser', () => {
	installCanvasFakes();
	document.body.lang = 'en';
	document.body.innerHTML = '<div lang="fr"></div><div lang="en_US"></div>';

	const [french, unreadable] = [...document.body.children].map((parent) => {
		const strip = document.createElement('sonic-wavestrip');

		strip.setAttribute('max', '4000');
		strip.setAttribute('value', '3725');
		parent.append(strip);

		return strip.querySelector('.sonic-wavestrip-canvas')?.getAttribute('aria-valuetext');
	});

	expect(french).toMatch(/heure.+minutes.+secondes/);
	expect(unreadable).toBe(
		new Intl.DurationFormat(undefined, { style: 'long' }).format({
			hours: 1,
			minutes: 2,
			seconds: 5,
		}),
	);
});

test('without Intl.DurationFormat the strip still binds and speaks the clock', () => {
	installCanvasFakes();

	const durationFormat = Intl.DurationFormat;

	Reflect.deleteProperty(Intl, 'DurationFormat');
	try {
		const { canvas } = mountWavestrip('max="4000" step="5" value="3725"');

		expect(canvas.getAttribute('aria-valuetext')).toBe('1:02:05');

		canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
		expect(canvas.getAttribute('aria-valuetext')).toBe('1:02:10');
	} finally {
		Object.assign(Intl, { DurationFormat: durationFormat });
	}
});

test('formatValue replaces the text and the spoken text, and the entry still opens on a clock', () => {
	installCanvasFakes();

	const { canvas, control, wavestrip } = mountWavestrip('max="300" step="0" value="83.47"');

	wavestrip.formatValue = (seconds) => `${seconds.toFixed(1)} s`;

	expect(wavestrip.valueText).toBe('83.5 s');
	expect(canvas.getAttribute('aria-valuetext')).toBe('83.5 s');
	expect(openEntry(control).value).toBe('1:23');
});

test('formatSpokenValue replaces only the spoken text', () => {
	installCanvasFakes();

	const { canvas, wavestrip } = mountWavestrip('max="300" step="0" value="83.47"');

	wavestrip.formatSpokenValue = (seconds) => `${String(Math.floor(seconds))} seconds in`;

	expect(wavestrip.valueText).toBe('1:23');
	expect(canvas.getAttribute('aria-valuetext')).toBe('83 seconds in');
});

test('the spoken clock is given the value spoken-step rounded', () => {
	installCanvasFakes();
	document.body.lang = 'en';

	const { canvas } = mountWavestrip('max="300" step="0" spoken-step="5" value="83.47"');

	expect(canvas.getAttribute('aria-valuetext')).toBe('1 minute, 25 seconds');
});
