import { afterEach, expect, test, vi } from 'vitest';

import type { SonicSpectrum } from '#elements/spectrum.ts';

import '#define/spectrum.ts';

import {
	FakeIntersectionObserver,
	FakeResizeObserver,
	installCanvasFakes,
} from './canvas-fakes.ts';
import { mountControl } from './helpers.ts';

const binCount = 512;

afterEach(() => {
	document.body.replaceChildren();
});

function frameOf(levels: Record<number, number>, length = binCount): Float32Array {
	const frame = new Float32Array(length).fill(-Infinity);

	for (const [bin, level] of Object.entries(levels)) frame[Number(bin)] = level;

	return frame;
}

function countDraws(): () => number {
	const context = document.createElement('canvas').getContext('2d');
	if (!context) throw new Error('The fakes gave no context');

	const clears = vi.spyOn(context, 'clearRect');

	return () => clears.mock.calls.length;
}

function mountSpectrum(attributes = ''): { draws: () => number; spectrum: SonicSpectrum } {
	const draws = countDraws();
	const { host: spectrum } = mountControl('sonic-spectrum', attributes);

	FakeResizeObserver.instances.at(-1)?.report([320, 96], [320, 96]);

	return { draws, spectrum };
}

function fakeAnalyser(): { node: AnalyserNode; pulls: () => number } {
	const pull = vi.fn((buffer: Float32Array) => buffer.fill(-100));

	return {
		node: {
			context: { sampleRate: 44_100 },
			frequencyBinCount: binCount,
			getFloatFrequencyData: pull,
		} as unknown as AnalyserNode,
		pulls: () => pull.mock.calls.length,
	};
}

test('two pushes in one frame paint once, and the peak holds the louder', () => {
	const { flushFrames } = installCanvasFakes();
	const { draws, spectrum } = mountSpectrum('sample-rate="44100"');

	flushFrames();
	spectrum.push(frameOf({ 100: -30 }));
	spectrum.push(frameOf({ 200: -12 }));
	flushFrames();

	expect(draws()).toBe(2);
	expect(spectrum.peak).toEqual({ decibels: -12, frequency: 8613.28125 });
});

test('a frame pushed before connect is painted after it, and goes on falling', () => {
	const { flushFrames } = installCanvasFakes();
	const draws = countDraws();
	const spectrum = document.createElement('sonic-spectrum');

	spectrum.push(frameOf({ 100: -30 }));
	document.body.append(spectrum);
	FakeResizeObserver.instances.at(-1)?.report([320, 96], [320, 96]);
	flushFrames(0);
	flushFrames(16);

	expect(draws()).toBe(2);
});

test('an analyser is pulled once a frame, and never out of view, disabled or disconnected', async () => {
	const { flushFrames } = installCanvasFakes();
	const { spectrum } = mountSpectrum();
	const { node, pulls } = fakeAnalyser();
	const view = FakeIntersectionObserver.instances.at(-1);

	spectrum.analyser = node;
	flushFrames();
	flushFrames();
	expect(pulls()).toBe(2);

	view?.report(false);
	flushFrames();
	expect(pulls()).toBe(2);

	view?.report(true);
	flushFrames();
	expect(pulls()).toBe(3);

	spectrum.disabled = true;
	flushFrames();
	flushFrames();
	expect(pulls()).toBe(3);

	spectrum.disabled = false;
	flushFrames();
	expect(pulls()).toBe(4);

	spectrum.remove();
	await Promise.resolve();
	flushFrames();
	expect(pulls()).toBe(4);
});

test('a pushed frame stops asking for frames once it has fallen to the floor', () => {
	const { flushFrames } = installCanvasFakes();
	const { draws, spectrum } = mountSpectrum('min="-60"');

	flushFrames(0);
	spectrum.push(frameOf({ 100: -50 }));
	flushFrames(0);
	flushFrames(100);
	expect(draws()).toBe(3);

	flushFrames(1000);
	flushFrames(1100);
	flushFrames(1200);
	expect(draws()).toBe(4);
});

test('a frame with a new bin count starts the levels again', () => {
	const { flushFrames } = installCanvasFakes();
	const { draws, spectrum } = mountSpectrum();

	flushFrames();
	spectrum.push(frameOf({ 400: -6 }));
	spectrum.push(frameOf({}, 8));
	flushFrames();

	expect(draws()).toBe(1);
});

test('a frequency pair that is no range falls back to 20 Hz to 20 kHz', () => {
	installCanvasFakes();

	const { spectrum } = mountSpectrum('frequency-max="100" frequency-min="500" sample-rate="44100"');

	spectrum.push(frameOf({ 2: -20 }));

	expect(spectrum.peak?.frequency).toBeCloseTo(86.13, 2);
});

test('the bars stay in their columns as they fall once the analyser is unset', () => {
	const { flushFrames } = installCanvasFakes();
	const { spectrum } = mountSpectrum();
	const context = document.createElement('canvas').getContext('2d');
	if (!context) throw new Error('The fakes gave no context');

	const lines = vi.spyOn(context, 'lineTo');
	const spikeColumn = (): number | undefined => {
		const [column] = lines.mock.calls.toSorted(([, first], [, second]) => first - second)[0] ?? [];

		lines.mockClear();

		return column;
	};

	spectrum.analyser = {
		context: { sampleRate: 22_050 },
		frequencyBinCount: binCount,
		getFloatFrequencyData: (buffer: Float32Array) => buffer.fill(-Infinity).fill(-6, 256, 257),
	} as unknown as AnalyserNode;
	flushFrames(0);

	const pulled = spikeColumn();

	spectrum.analyser = undefined;
	flushFrames(16);

	expect(pulled).toBeGreaterThan(0);
	expect(spikeColumn()).toBe(pulled);
});
