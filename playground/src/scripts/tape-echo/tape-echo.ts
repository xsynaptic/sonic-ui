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
import type { SourceName } from '#scripts/tape-echo/sources.ts';

import { dataHook, find, readControls } from '#scripts/find.ts';
import { applyFormat } from '#scripts/formats.ts';
import { frameLoop } from '#scripts/frame-loop.ts';
import { echoModes } from '#scripts/stop-names.ts';
import { beatMsOf, createTapTempo } from '#scripts/tap-tempo.ts';
import { createEcho } from '#scripts/tape-echo/audio.ts';
import { divisions, timeRange } from '#scripts/tape-echo/divisions.ts';
import { createPlucks } from '#scripts/tape-echo/plucks.ts';
import {
	createFilePlayer,
	createInlet,
	createMic,
	createSourceSwitch,
	isSourceName,
} from '#scripts/tape-echo/sources.ts';

const headSpec = { dial: SonicDial, division: SonicSegmented };

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
	play: SonicButton,
	source: SonicSegmented,
	spectrum: SonicSpectrum,
	style: SonicNumber,
	tap: SonicButton,
};

type EchoHead = ControlsOf<typeof headSpec>;

interface Controls extends ControlsOf<typeof panelSpec> {
	dials: ControlsOf<typeof dialSpec>;
	filePicker: HTMLInputElement;
	heads: Array<EchoHead>;
	meters: { input: SonicMeter; output: SonicMeter };
	micHint: HTMLElement;
	sourceStatus: HTMLElement;
	tapLed: HTMLElement;
}

type FilePlayer = ReturnType<typeof createFilePlayer>;

interface Engine extends ReturnType<typeof createSources> {
	context: AudioContext;
	echo: Echo;
}

type TapTempo = ReturnType<typeof createTapTempo>;

const ticksPerBeat = 48;
const micRefusals: Record<string, string> = {
	NotAllowedError: 'Microphone permission was refused',
	NotFoundError: 'No microphone was found',
};

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
		filePicker: find(panel, echoHook('file'), HTMLInputElement),
		heads: [...panel.querySelectorAll(':scope [data-echo-head]')].map((head) =>
			readControls(head, headSpec, echoHook),
		),
		meters: readControls(
			panel,
			{ input: SonicMeter, output: SonicMeter },
			(name) => `:scope [data-echo-meter="${name}"]`,
		),
		micHint: find(panel, echoHook('mic-hint'), HTMLElement),
		sourceStatus: find(panel, echoHook('source-status'), HTMLElement),
		tapLed: find(controls.tap, ':scope > .sonic-led', HTMLElement),
	};
}

function secondsOf(head: EchoHead, bpm: number): number {
	if (head.dial.dataset.format !== 'note') return head.dial.value / 1000;

	return (head.dial.value / ticksPerBeat) * (beatMsOf(bpm) / 1000);
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
	const { dial } = head;
	const seconds = secondsOf(head, bpm);

	dial.notched = division !== 'time';
	if (division === 'time') {
		dial.positions = undefined;
		dial.min = timeRange.min;
		dial.max = timeRange.max;
		dial.taper = 'log';
		applyFormat(dial, 'milliseconds');
		dial.value = Math.round(seconds * 1000);
		return;
	}

	dial.positions = [...divisions[division]];
	applyFormat(dial, 'note');
	dial.value = (seconds * 1000 * ticksPerBeat) / beatMsOf(bpm);
}

function dimSecondHead({ heads, mode }: Controls): void {
	const dial = heads[1]?.dial;

	if (dial) dial.dimmed = echoModes.valueAt(mode.value) !== 'dual';
}

function peakOf(analyser: AnalyserNode, samples: Float32Array<ArrayBuffer>): number {
	let peak = 0;

	analyser.getFloatTimeDomainData(samples);
	for (const sample of samples) peak = Math.max(peak, Math.abs(sample));

	return peak;
}

function createSources(context: AudioContext, destination: AudioNode) {
	const phrase = createInlet(destination);
	const plucks = createPlucks(context, phrase.node);
	const file = createFilePlayer(context, destination);
	let isPhrasing = false;

	return {
		file,
		isPhrasing: () => isPhrasing,
		plucks,
		select: createSourceSwitch({
			file: file.open,
			mic: createMic(context, destination),
			phrase: () => {
				plucks.restart();
				phrase.fade(true);
				isPhrasing = true;

				return Promise.resolve(() => {
					phrase.fade(false);
					isPhrasing = false;
				});
			},
		}),
	};
}

function heardSource(name: string, file: FilePlayer): SourceName | undefined {
	if (!isSourceName(name)) return undefined;
	if (name === 'file' && !file.hasFile()) return undefined;

	return name;
}

function refusalOf(error: unknown): string {
	const refusal = error instanceof DOMException ? micRefusals[error.name] : undefined;

	return refusal ?? 'The microphone is unavailable';
}

function showSource({ micHint, source, sourceStatus }: Controls, message: string): void {
	micHint.hidden = source.value !== 'mic';
	sourceStatus.textContent = message;
}

function createTransport(controls: Controls, tempo: TapTempo) {
	const { bpm, meters, play, source, spectrum, tapLed } = controls;
	const samples = new Float32Array(1024);
	let engine: Engine | undefined;
	let runs = 0;

	const loop = frameLoop((_elapsedSeconds, time) => {
		if (!engine) return;

		const beatSeconds = beatMsOf(bpm.value) / 1000;

		const isPhrasing = engine.isPhrasing();

		if (isPhrasing) engine.plucks.schedule(beatSeconds);
		tapLed.toggleAttribute(
			'data-sonic-lit',
			isPhrasing ? engine.plucks.isOnBeat(beatSeconds) : tempo.phaseAt(time) < 0.5,
		);
		meters.input.level = peakOf(engine.echo.meters.input, samples);
		meters.output.level = peakOf(engine.echo.meters.output, samples);
	});

	function start(): Engine {
		if (engine) return engine;

		const context = new AudioContext();
		const echo = createEcho(context);

		engine = { context, echo, ...createSources(context, echo.input) };

		return engine;
	}

	function fallBack(message: string): void {
		source.value = 'phrase';
		showSource(controls, message);
		void feed();
	}

	async function feed(): Promise<void> {
		if (!engine) return;

		try {
			await engine.select(play.pressed ? heardSource(source.value, engine.file) : undefined);
		} catch (error) {
			fallBack(refusalOf(error));
		}
	}

	async function load(file: Blob): Promise<void> {
		try {
			await start().file.load(file);
		} catch {
			fallBack('That file could not be read as audio');
			return;
		}
		if (source.value === 'file') await feed();
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
			await feed();
			return;
		}

		const current = runs;
		const { context, echo } = start();

		await context.resume();
		if (current !== runs) return;

		echo.update(paramsOf(controls));
		echo.fade(true);
		spectrum.analyser = echo.spectrum;
		loop.start();
		await feed();
	}

	return {
		fallBack,
		feed,
		hasFile: () => engine?.file.hasFile() ?? false,
		load,
		restart: () => engine?.plucks.restart(),
		run,
		update: () => engine?.echo.update(paramsOf(controls)),
	};
}

type Transport = ReturnType<typeof createTransport>;

function bindSource(panel: HTMLElement, controls: Controls, transport: Transport): void {
	const { filePicker, source } = controls;

	source.addEventListener('change', () => {
		showSource(controls, '');
		if (source.value === 'file') filePicker.click();
		void transport.feed();
	});
	filePicker.addEventListener('change', () => {
		const file = filePicker.files?.[0];

		if (file) void transport.load(file);
	});
	filePicker.addEventListener('cancel', () => {
		if (!transport.hasFile()) transport.fallBack('');
	});
	panel.addEventListener('dragover', (event) => {
		event.preventDefault();
	});
	panel.addEventListener('drop', (event) => {
		const file = event.dataTransfer?.files[0];

		event.preventDefault();
		if (!file) return;

		source.value = 'file';
		showSource(controls, '');
		void transport.load(file);
	});
}

function bindEcho(panel: HTMLElement): void {
	const controls = readPanel(panel);
	const { bpm, heads, mode, play, tap: tapButton } = controls;
	const tempo = createTapTempo(bpm.value);
	const transport = createTransport(controls, tempo);

	panel.addEventListener('input', (event) => {
		if (event.target === mode) dimSecondHead(controls);
		if (event.target === bpm) tempo.retune(bpm.value);
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
	bindSource(panel, controls, transport);
	dimSecondHead(controls);
}

const panel = document.querySelector<HTMLElement>('[data-tape-echo]');

if (panel) bindEcho(panel);
