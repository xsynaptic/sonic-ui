import {
	SonicButton,
	SonicDial,
	SonicMeter,
	SonicNumber,
	SonicSegmented,
	SonicSpectrum,
} from '@xsynaptic/sonic-ui';

import type { ControlsOf } from '#scripts/find.ts';
import type { Echo, EchoParams } from '#scripts/tape-echo/audio.ts';
import type { Division } from '#scripts/tape-echo/divisions.ts';

import { dataHook, find, readControls } from '#scripts/find.ts';
import { applyFormat, formatterFor } from '#scripts/formats.ts';
import { frameLoop } from '#scripts/frame-loop.ts';
import { echoModes } from '#scripts/stop-names.ts';
import { beatMsOf, createTapTempo } from '#scripts/tap-tempo.ts';
import { createEcho } from '#scripts/tape-echo/audio.ts';
import { divisions, timeRange } from '#scripts/tape-echo/divisions.ts';
import { createPlucks } from '#scripts/tape-echo/plucks.ts';

const headSpec = { dial: SonicDial, division: SonicSegmented, number: SonicNumber };

const dialSpec = {
	feedback: SonicDial,
	feel: SonicDial,
	groove: SonicDial,
	highCut: SonicDial,
	input: SonicDial,
	lowCut: SonicDial,
	mix: SonicDial,
	output: SonicDial,
	saturation: SonicDial,
};

const panelSpec = {
	bpm: SonicNumber,
	mode: SonicDial,
	peakRead: SonicButton,
	play: SonicButton,
	spectrum: SonicSpectrum,
	style: SonicNumber,
	tap: SonicButton,
};

type EchoHead = ControlsOf<typeof headSpec>;

interface Controls extends ControlsOf<typeof panelSpec> {
	dials: ControlsOf<typeof dialSpec>;
	heads: Array<EchoHead>;
	meters: { input: SonicMeter; output: SonicMeter };
	peakStatus: HTMLElement;
	tapLed: HTMLElement;
}

interface Engine {
	context: AudioContext;
	echo: Echo;
	plucks: ReturnType<typeof createPlucks>;
}

const ticksPerBeat = 48;

function isDivision(value: string): value is Division {
	return value === 'time' || Object.hasOwn(divisions, value);
}

function echoHook(name: string): string {
	return dataHook(`echo-${name}`);
}

function readPanel(panel: Element): Controls {
	const controls = readControls(panel, panelSpec, echoHook);

	return {
		...controls,
		dials: readControls(panel, dialSpec, echoHook),
		heads: [...panel.querySelectorAll(':scope [data-echo-head]')].map((head) =>
			readControls(head, headSpec, echoHook),
		),
		meters: readControls(
			panel,
			{ input: SonicMeter, output: SonicMeter },
			(name) => `:scope [data-echo-meter="${name}"]`,
		),
		peakStatus: find(panel, echoHook('peak-status'), HTMLElement),
		tapLed: find(controls.tap, ':scope > .sonic-led', HTMLElement),
	};
}

function secondsOf(head: EchoHead, bpm: number): number {
	if (head.number.dataset.format !== 'note') return head.number.value / 1000;

	return (head.number.value / ticksPerBeat) * (beatMsOf(bpm) / 1000);
}

function paramsOf({ bpm, dials, heads, mode, style }: Controls): EchoParams {
	const [first = 0.25, second = 0.25] = heads.map((head) => secondsOf(head, bpm.value));

	return {
		feedback: dials.feedback.value,
		feel: dials.feel.value,
		groove: dials.groove.value,
		highCut: dials.highCut.value,
		input: dials.input.value,
		lowCut: dials.lowCut.value,
		mix: dials.mix.value,
		mode: echoModes.valueAt(mode.value) ?? 'single',
		output: dials.output.value,
		saturation: dials.saturation.value,
		style: style.value,
		times: [first, second],
	};
}

function setDivision(head: EchoHead, division: Division, bpm: number): void {
	const seconds = secondsOf(head, bpm);

	head.dial.notched = division !== 'time';
	for (const control of [head.dial, head.number]) {
		if (division === 'time') {
			control.positions = undefined;
			control.min = timeRange.min;
			control.max = timeRange.max;
			control.taper = 'log';
			applyFormat(control, 'milliseconds');
			control.value = Math.round(seconds * 1000);
			continue;
		}

		control.positions = [...divisions[division]];
		applyFormat(control, 'note');
		control.value = (seconds * 1000 * ticksPerBeat) / beatMsOf(bpm);
	}
}

function dimSecondHead({ heads, mode }: Controls): void {
	const isDimmed = echoModes.valueAt(mode.value) !== 'dual';

	for (const control of [heads[1]?.dial, heads[1]?.number]) {
		if (control) control.dimmed = isDimmed;
	}
}

function peakOf(analyser: AnalyserNode, samples: Float32Array<ArrayBuffer>): number {
	let peak = 0;

	analyser.getFloatTimeDomainData(samples);
	for (const sample of samples) peak = Math.max(peak, Math.abs(sample));

	return peak;
}

function createTransport(controls: Controls) {
	const { bpm, meters, spectrum, tapLed } = controls;
	const samples = new Float32Array(1024);
	let engine: Engine | undefined;
	let runs = 0;

	const loop = frameLoop(() => {
		if (!engine) return;

		const beatSeconds = beatMsOf(bpm.value) / 1000;

		engine.plucks.schedule(beatSeconds);
		tapLed.toggleAttribute('data-sonic-lit', engine.plucks.isOnBeat(beatSeconds));
		meters.input.level = peakOf(engine.echo.meters.input, samples);
		meters.output.level = peakOf(engine.echo.meters.output, samples);
	});

	function start(): Engine {
		if (engine) return engine;

		const context = new AudioContext();
		const echo = createEcho(context);

		engine = { context, echo, plucks: createPlucks(context, echo.input) };

		return engine;
	}

	async function run(isRunning: boolean): Promise<void> {
		runs += 1;
		loop.stop();

		if (!isRunning) {
			engine?.echo.fade(false);
			// An idle page pulls nothing; the bars fall to the floor on their own
			spectrum.analyser = undefined;
			delete tapLed.dataset.sonicLit;
			meters.input.level = 0;
			meters.output.level = 0;
			return;
		}

		const current = runs;
		const { context, echo, plucks } = start();

		await context.resume();
		if (current !== runs) return;

		echo.update(paramsOf(controls));
		echo.fade(true);
		spectrum.analyser = echo.spectrum;
		plucks.restart();
		loop.start();
	}

	return {
		restart: () => engine?.plucks.restart(),
		run,
		update: () => engine?.echo.update(paramsOf(controls)),
	};
}

// The drawing is hidden from assistive technology, so the reading is spoken on request
function bindPeakRead({ peakRead, peakStatus, spectrum }: Controls): void {
	const formatHertz = formatterFor('hertz') ?? String;
	const formatDecibels = formatterFor('db') ?? String;

	peakRead.addEventListener('click', () => {
		const peak = spectrum.peak;

		peakStatus.textContent = peak
			? `Peak ${formatHertz(peak.frequency)}, ${formatDecibels(peak.decibels)}`
			: 'No signal yet';
		spectrum.resetPeak();
	});
}

function bindEcho(panel: Element): void {
	const controls = readPanel(panel);
	const { bpm, heads, mode, play, tap: tapButton } = controls;
	const transport = createTransport(controls);
	const tempo = createTapTempo(bpm.value);

	panel.addEventListener('input', (event) => {
		for (const head of heads) {
			if (event.target === head.dial) head.number.value = head.dial.value;
			if (event.target === head.number) head.dial.value = head.number.value;
		}
		if (event.target === mode) dimSecondHead(controls);
		transport.update();
	});
	panel.addEventListener('change', (event) => {
		const head = heads.find((candidate) => candidate.division === event.target);
		const division = head?.division.value ?? '';

		if (head && isDivision(division)) setDivision(head, division, bpm.value);
		transport.update();
	});
	tapButton.addEventListener('change', () => {
		if (!tapButton.pressed) return;

		const settled = tempo.tap(performance.now());

		if (settled !== undefined) bpm.value = settled;
		transport.restart();
		transport.update();
	});
	play.addEventListener('change', () => {
		void transport.run(play.pressed);
	});
	bindPeakRead(controls);
	dimSecondHead(controls);
}

const panel = document.querySelector('[data-tape-echo]');

if (panel) bindEcho(panel);
