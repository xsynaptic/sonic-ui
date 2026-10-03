import { expect, test, vi } from 'vitest';

import type { SurfaceFrame } from '#lib/canvas-surface.ts';

import { bindSurface } from '#lib/canvas-surface.ts';

import {
	FakeIntersectionObserver,
	FakeResizeObserver,
	installCanvasFakes,
} from './canvas-fakes.ts';

function mountSurface(): {
	canvas: HTMLCanvasElement;
	controller: AbortController;
	frames: Array<SurfaceFrame<'ink'>>;
	paints: () => number;
	resize: FakeResizeObserver;
	surface: ReturnType<typeof bindSurface>;
	view: FakeIntersectionObserver;
} {
	const canvas = document.createElement('canvas');
	const controller = new AbortController();
	const frames: Array<SurfaceFrame<'ink'>> = [];

	document.body.replaceChildren(canvas);

	const surface = bindSurface({
		canvas,
		colours: { ink: '--_sonic-test-colour' },
		paint: (_context, frame) => {
			frames.push(frame);
		},
		signal: controller.signal,
	});
	const resize = FakeResizeObserver.instances.at(-1);
	const view = FakeIntersectionObserver.instances.at(-1);
	if (!resize || !view) throw new Error('The surface observed nothing');

	return { canvas, controller, frames, paints: () => frames.length, resize, surface, view };
}

test('two paint requests before a frame paint once', () => {
	const { flushFrames } = installCanvasFakes();
	const { paints, resize, surface } = mountSurface();

	resize.report([100, 20], [100, 20]);
	flushFrames();
	surface.requestFrame();
	surface.requestFrame();
	flushFrames();

	expect(paints()).toBe(2);
});

test('a plain frame reads no styles and leaves the backing store alone', () => {
	const { flushFrames } = installCanvasFakes();
	const { canvas, paints, resize, surface } = mountSurface();

	resize.report([100, 20], [100, 20]);
	flushFrames();

	const reads = vi.spyOn(globalThis, 'getComputedStyle');
	const widths = vi.spyOn(canvas, 'width', 'set');
	const heights = vi.spyOn(canvas, 'height', 'set');

	surface.requestFrame();
	flushFrames();

	expect(paints()).toBe(2);
	expect(reads).not.toHaveBeenCalled();
	expect(widths).not.toHaveBeenCalled();
	expect(heights).not.toHaveBeenCalled();
});

test('a box that collapses paints nothing, and reads the styles again when it returns', () => {
	const { flushFrames } = installCanvasFakes();
	const { paints, resize } = mountSurface();

	resize.report([100, 20], [100, 20]);
	flushFrames();

	const reads = vi.spyOn(globalThis, 'getComputedStyle');

	resize.report([0, 0], [0, 0]);
	flushFrames();
	expect(paints()).toBe(1);

	resize.report([100, 20], [100, 20]);
	flushFrames();
	expect(paints()).toBe(2);
	expect(reads).toHaveBeenCalledTimes(1);
});

test('only a rebuild, a resize or an invalidate leaves the next frame dirty', () => {
	const { flushFrames } = installCanvasFakes();
	const { frames, resize, surface } = mountSurface();
	const step = (act: () => void): boolean | undefined => {
		act();
		flushFrames();

		return frames.at(-1)?.isDirty;
	};

	resize.report([100, 20], [100, 20]);
	flushFrames();

	expect([
		step(() => {
			surface.requestFrame();
		}),
		step(() => {
			surface.rebuild();
		}),
		step(() => {
			surface.requestFrame();
		}),
		step(() => {
			resize.report([120, 20], [120, 20]);
		}),
		step(() => {
			surface.invalidate();
		}),
		step(() => {
			surface.requestFrame();
		}),
	]).toEqual([false, true, false, true, true, false]);
});

test('a reduced-motion change reads the styles again and paints the new flag', () => {
	const { flushFrames, queries } = installCanvasFakes();
	const { frames, resize } = mountSurface();
	const motion = queries.find(({ media }) => media.includes('reduced-motion'));
	if (!motion) throw new Error('The surface watched no reduced-motion query');

	resize.report([100, 20], [100, 20]);
	flushFrames();

	const reads = vi.spyOn(globalThis, 'getComputedStyle');

	Object.assign(motion, { matches: true });
	motion.dispatchEvent(new Event('change'));
	flushFrames();

	expect(reads).toHaveBeenCalledTimes(1);
	expect(frames.at(-1)?.look.isReducedMotion).toBe(true);
});

test('five colour transitions before a frame read the styles once', () => {
	const { flushFrames } = installCanvasFakes();
	const { canvas, paints, resize } = mountSurface();
	const reads = vi.spyOn(globalThis, 'getComputedStyle');

	resize.report([100, 20], [100, 20]);
	flushFrames();
	reads.mockClear();
	for (let index = 0; index < 5; index += 1) canvas.dispatchEvent(new Event('transitionrun'));
	flushFrames();

	expect(reads).toHaveBeenCalledTimes(1);
	expect(paints()).toBe(2);
});

test('without a device-pixel box, the canvas takes the CSS box times the ratio, rounded', () => {
	const { flushFrames } = installCanvasFakes();

	FakeResizeObserver.refusesDeviceBox = true;
	vi.stubGlobal('devicePixelRatio', 1.5);

	const { canvas, resize } = mountSurface();

	resize.report([100.5, 20]);
	flushFrames();

	expect([canvas.width, canvas.height]).toEqual([151, 30]);
});

test('a device box that agrees with the ratio within a pixel is taken as it is', () => {
	const { flushFrames } = installCanvasFakes();

	vi.stubGlobal('devicePixelRatio', 2);

	const { canvas, resize } = mountSurface();

	resize.report([150.3, 20.2], [300, 41]);
	flushFrames();

	expect([canvas.width, canvas.height]).toEqual([300, 41]);
});

test.each<{
	axis: string;
	css: [number, number];
	device: [number, number];
	expected: Array<number>;
}>([
	{ axis: 'both ways', css: [100.4, 20], device: [100, 20], expected: [201, 40] },
	{ axis: 'along', css: [100.4, 20], device: [100, 40], expected: [201, 40] },
	{ axis: 'across', css: [100, 20.3], device: [200, 20], expected: [200, 41] },
])(
	'a device box that disagrees with the ratio $axis gives way to the CSS box times the ratio',
	({ css, device, expected }) => {
		const { flushFrames } = installCanvasFakes();

		vi.stubGlobal('devicePixelRatio', 2);

		const { canvas, resize } = mountSurface();

		resize.report(css, device);
		flushFrames();

		expect([canvas.width, canvas.height]).toEqual(expected);
	},
);

test('out of view nothing paints, and coming back reads the styles and paints once', () => {
	const { flushFrames } = installCanvasFakes();
	const { paints, resize, surface, view } = mountSurface();
	const reads = vi.spyOn(globalThis, 'getComputedStyle');

	resize.report([100, 20], [100, 20]);
	flushFrames();
	view.report(false);
	surface.requestFrame();
	flushFrames();
	expect(paints()).toBe(1);

	reads.mockClear();
	view.report(true);
	flushFrames();
	expect(paints()).toBe(2);
	expect(reads).toHaveBeenCalledTimes(1);
});

test('a paint requested before the abort never lands, and the observers let go', () => {
	const { flushFrames } = installCanvasFakes();
	const { controller, paints, resize, surface, view } = mountSurface();

	resize.report([100, 20], [100, 20]);
	flushFrames();
	surface.requestFrame();
	controller.abort();
	flushFrames();

	expect(paints()).toBe(1);
	expect([resize.isDisconnected, view.isDisconnected]).toEqual([true, true]);
});

test('a ratio change arms a query for the new ratio, drops the old one and rescales', () => {
	const { flushFrames, queries } = installCanvasFakes();

	FakeResizeObserver.refusesDeviceBox = true;

	const { canvas, resize } = mountSurface();
	const resolutions = (): Array<string> =>
		queries.filter(({ media }) => media.startsWith('(resolution')).map(({ media }) => media);

	resize.report([100, 20]);
	flushFrames();
	vi.stubGlobal('devicePixelRatio', 2);

	const first = queries.find(({ media }) => media.startsWith('(resolution'));

	first?.dispatchEvent(new Event('change'));
	first?.dispatchEvent(new Event('change'));
	flushFrames();

	expect(resolutions()).toEqual(['(resolution: 1dppx)', '(resolution: 2dppx)']);
	expect(canvas.width).toBe(200);
});

test('resize hears each new size once, and lengths read their registered properties as numbers', () => {
	const { flushFrames } = installCanvasFakes();
	const canvas = document.createElement('canvas');
	const sizes: Array<[number, number, number]> = [];
	const looks: Array<Record<'pitch' | 'unset', number>> = [];

	vi.stubGlobal('devicePixelRatio', 2);
	document.body.replaceChildren(canvas);
	canvas.style.setProperty('--_sonic-test-pitch', '4.5px');
	bindSurface({
		canvas,
		colours: {},
		lengths: { pitch: '--_sonic-test-pitch', unset: '--_sonic-test-unset' },
		paint: (_context, frame) => {
			looks.push(frame.look.lengths);
		},
		resize: (size) => {
			sizes.push([size.width, size.height, size.dpr]);
		},
		signal: new AbortController().signal,
	});

	const resize = FakeResizeObserver.instances.at(-1);

	resize?.report([100, 20], [200, 40]);
	resize?.report([100, 20], [200, 40]);
	resize?.report([120, 20], [240, 40]);
	flushFrames();

	expect(sizes).toEqual([
		[200, 40, 2],
		[240, 40, 2],
	]);
	expect(looks.at(-1)).toEqual({ pitch: 4.5, unset: 0 });
});

test('a ratio change the device box does not show still reaches the frame', () => {
	const { flushFrames, queries } = installCanvasFakes();
	const { canvas, frames, resize } = mountSurface();

	resize.report([100, 20], [100, 20]);
	flushFrames();
	vi.stubGlobal('devicePixelRatio', 2);
	queries.find(({ media }) => media.startsWith('(resolution'))?.dispatchEvent(new Event('change'));
	flushFrames();

	expect(frames.at(-1)?.size).toEqual({ dpr: 2, height: 20, width: 100 });
	expect(canvas.width).toBe(100);
});
