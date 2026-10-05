import { afterEach, expect, test, vi } from 'vitest';

import type { SonicWavestrip } from '#elements/wavestrip.ts';

import '#define/wavestrip.ts';

import { FakeResizeObserver, installCanvasFakes } from './canvas-fakes.ts';
import { mountControl, pointerAt, recordEvents } from './helpers.ts';

afterEach(() => {
	document.body.replaceChildren();
});

function mountWavestrip(attributes: string): {
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

	return { control, wavestrip };
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

	const { control, wavestrip } = mountWavestrip('max="300" key-step="5" value="60"');
	const events = recordEvents(document.body);

	keyAt(control, 'keydown', true);
	wavestrip.value = 10;
	keyAt(control, 'keydown', true);
	keyAt(control, 'keydown', true);
	expect(events).toEqual(['input', 'input', 'input']);
	expect(wavestrip.value).toBe(75);

	keyAt(control, 'keyup', false);
	expect(events).toEqual(['input', 'input', 'input', 'change']);
});

test('a key scrub that loses focus changes once, and its keyup adds nothing', () => {
	installCanvasFakes();

	const { control } = mountWavestrip('max="300" key-step="5" value="60"');
	const events = recordEvents(document.body);

	keyAt(control, 'keydown', true);
	keyAt(control, 'keydown', true);
	control.dispatchEvent(new FocusEvent('blur'));
	keyAt(control, 'keyup', false);

	expect(events).toEqual(['input', 'input', 'change']);
});

test('a single key press changes at once', () => {
	installCanvasFakes();

	const { control } = mountWavestrip('max="300" key-step="5" value="60"');
	const events = recordEvents(document.body);

	keyAt(control, 'keydown', false);

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

function markerDots(control: HTMLElement): Array<HTMLElement> {
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

	const [dot] = markerDots(control);

	expect(dot?.style.getPropertyValue('--_sonic-marker-from')).toBe('0.25');
	expect(dot?.style.getPropertyValue('--_sonic-marker-to')).toBe('0.75');
});

test('the band holds one part per marker in the order `markers` reads back', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('min="30" max="330" step="0" value="50"');

	wavestrip.markers = [{ start: 200 }, { end: 150, start: 100 }, { start: 50 }];

	expect(
		markerDots(control).map((part) => [
			part.className,
			Number(part.style.getPropertyValue('--_sonic-marker-from')) * 300 + 30,
		]),
	).toEqual(
		wavestrip.markers.map(({ end, start }) => [
			end === undefined ? 'sonic-wavestrip-marker' : 'sonic-wavestrip-region',
			start,
		]),
	);
});

test('a value write leaves the marker dots as they were built', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('max="300" value="10"');

	wavestrip.markers = [{ start: 60 }, { end: 120, kind: 'loop', start: 90 }];

	const built = markerDots(control);

	wavestrip.value = 200;

	const after = markerDots(control);

	// `toEqual` compares nodes by markup, which a rebuild matches
	expect(after.map((dot, index) => dot === built[index])).toEqual([true, true]);
});

test('a kind names its token, and a kind that is not a plain name draws in the default colour', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('');

	wavestrip.markers = [
		{ kind: 'loop', start: 20 },
		{ kind: 'x);background:red', start: 40 },
	];

	const [loop, hostile] = markerDots(control);

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

	const { control } = mountWavestrip(
		'readout min="30" max="330" step="0" key-step="30" value="30"',
	);

	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'mouse' });
	expect(readoutAt(control)).toBe('0.25');

	keyAt(control, 'keydown', false);
	keyAt(control, 'keyup', false);
	expect(readoutAt(control)).toBe('0.1');

	vi.runAllTimers();
	vi.useRealTimers();
	expect(readoutAt(control)).toBe('0.25');

	midPointerAt(control, 'pointermove', { clientX: 150, pointerType: 'mouse' });
	expect(readoutAt(control)).toBe('0.5');
});

test('typed entry drops a hover, and a pointer moving while it is open brings none back', () => {
	installCanvasFakes();

	const { control } = mountWavestrip('readout min="30" max="330" step="0" value="60"');
	const entry = control.querySelector('input');
	if (!entry) throw new Error('The wavestrip has no entry');

	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'mouse' });
	control.dispatchEvent(
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

	const { control, wavestrip } = mountWavestrip('max="300" key-step="5" value="60"');
	const events = recordEvents(document.body);

	scrubKey(control, 'keydown', 'ArrowRight');
	wavestrip.disabled = true;
	expect(events).toEqual(['input', 'change']);

	scrubKey(control, 'keyup', 'ArrowRight');
	wavestrip.value = 10;
	expect(events).toEqual(['input', 'change']);
	expect(wavestrip.value).toBe(10);
});

test('switching key mid-scrub changes for the first key, then scrubs from there with the second', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip('max="300" key-step="5" value="60"');
	const events = recordEvents(document.body);

	scrubKey(control, 'keydown', 'ArrowRight');
	scrubKey(control, 'keydown', 'ArrowRight');
	scrubKey(control, 'keydown', 'ArrowLeft');
	expect(events).toEqual(['input', 'input', 'change', 'input']);

	scrubKey(control, 'keyup', 'ArrowRight');
	expect(events).toHaveLength(4);

	scrubKey(control, 'keydown', 'ArrowLeft');
	scrubKey(control, 'keydown', 'ArrowLeft');
	scrubKey(control, 'keyup', 'ArrowLeft');
	expect(wavestrip.value).toBe(55);
	expect(events.slice(4)).toEqual(['input', 'input', 'change']);
});

test('with double-press="none", two presses on one spot seek twice and Enter still opens the entry', () => {
	installCanvasFakes();

	const { control, wavestrip } = mountWavestrip(
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
	control.focus();
	control.dispatchEvent(
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

	const { control, wavestrip } = mountWavestrip(
		'min="30" max="330" step="0" key-step="30" value="50"',
	);
	const trace = revealTrace(wavestrip);

	keyAt(control, 'keydown', false);
	vi.advanceTimersByTime(600);
	keyAt(control, 'keydown', false);
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

	const { control, wavestrip } = mountWavestrip(
		'max="300" step="0" spoken-step="0.5" value="61.3"',
	);

	expect(control.getAttribute('aria-valuenow')).toBe('61.5');
	expect(wavestrip.value).toBe(61.3);

	wavestrip.spokenStep = undefined;
	expect(control.getAttribute('aria-valuenow')).toBe('61.3');
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
