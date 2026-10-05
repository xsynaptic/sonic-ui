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
	] as const) {
		midPointerAt(control, 'pointermove', { clientX, clientY });
		values.push(wavestrip.value);
	}
	midPointerAt(control, 'pointerup', { clientX: 100, clientY: -60 });

	expect(values).toEqual([50, 130, 50]);
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

function readoutAt(control: HTMLElement): string {
	return control.style.getPropertyValue('--_sonic-wavestrip-readout-at');
}

test('a key reveal takes the readout from a hover, which returns only when the pointer moves again', () => {
	installCanvasFakes();
	vi.useFakeTimers();

	const { control } = mountWavestrip(
		'readout min="30" max="330" step="0" key-step="30" value="30"',
	);

	midPointerAt(control, 'pointermove', { clientX: 75, pointerType: 'mouse' });
	expect(readoutAt(control)).toBe('0.25');

	keyAt(control, 'keydown', false);
	keyAt(control, 'keyup', false);
	vi.runAllTimers();
	vi.useRealTimers();
	expect(readoutAt(control)).toBe('0.1');

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
