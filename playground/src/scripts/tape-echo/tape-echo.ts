import type {
	SonicDial,
	SonicKey,
	SonicMeter,
	SonicNumber,
	SonicSegmented,
} from '@xsynaptic/sonic-ui';

import type { TapClock } from '#scripts/tap-tempo.ts';
import type { Echo, EchoParams } from '#scripts/tape-echo/audio.ts';
import type { Division } from '#scripts/tape-echo/divisions.ts';

import { find } from '#scripts/find.ts';
import { applyFormat } from '#scripts/formats.ts';
import { frameLoop } from '#scripts/frame-loop.ts';
import { beatMsOf, tap } from '#scripts/tap-tempo.ts';
import { createEcho, echoModeNames } from '#scripts/tape-echo/audio.ts';
import { divisions, timeRange } from '#scripts/tape-echo/divisions.ts';
import { createPlucks } from '#scripts/tape-echo/plucks.ts';

interface EchoHead {
	dial: SonicDial;
	division: SonicSegmented;
	number: SonicNumber;
}

interface Controls {
	bpm: SonicNumber;
	dials: Record<
		| 'feedback'
		| 'feel'
		| 'groove'
		| 'highCut'
		| 'input'
		| 'lowCut'
		| 'mix'
		| 'output'
		| 'saturation',
		SonicDial
	>;
	heads: Array<EchoHead>;
	meters: { input: SonicMeter; output: SonicMeter };
	mode: SonicDial;
	play: SonicKey;
	style: SonicNumber;
	tapKey: SonicKey;
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

function readControls(panel: Element): Controls {
	const tapKey = find<SonicKey>(panel, ':scope [data-echo-tap]');
	const dial = (name: string): SonicDial => find(panel, `:scope [data-echo-${name}]`);

	return {
		bpm: find(panel, ':scope [data-echo-bpm]'),
		dials: {
			feedback: dial('feedback'),
			feel: dial('feel'),
			groove: dial('groove'),
			highCut: dial('high-cut'),
			input: dial('input'),
			lowCut: dial('low-cut'),
			mix: dial('mix'),
			output: dial('output'),
			saturation: dial('saturation'),
		},
		heads: [...panel.querySelectorAll(':scope [data-echo-head]')].map((head) => ({
			dial: find(head, ':scope [data-echo-dial]'),
			division: find(head, ':scope [data-echo-division]'),
			number: find(head, ':scope [data-echo-number]'),
		})),
		meters: {
			input: find(panel, ':scope [data-echo-meter="input"]'),
			output: find(panel, ':scope [data-echo-meter="output"]'),
		},
		mode: find(panel, ':scope [data-echo-mode]'),
		play: find(panel, ':scope [data-echo-play]'),
		style: find(panel, ':scope [data-echo-style]'),
		tapKey,
		tapLed: find(tapKey, ':scope .sonic-led'),
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
		mode: echoModeNames[mode.value] ?? 'single',
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
			control.values = undefined;
			control.min = timeRange.min;
			control.max = timeRange.max;
			control.taper = 'log';
			applyFormat(control, 'milliseconds');
			control.value = Math.round(seconds * 1000);
			continue;
		}

		control.values = [...divisions[division]];
		applyFormat(control, 'note');
		control.value = (seconds * 1000 * ticksPerBeat) / beatMsOf(bpm);
	}
}

function dimSecondHead({ heads, mode }: Controls): void {
	const isDimmed = echoModeNames[mode.value] !== 'dual';

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
	const { bpm, meters, tapLed } = controls;
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
			delete tapLed.dataset.sonicLit;
			meters.input.level = 0;
			meters.output.level = 0;
			return;
		}

		const current = runs;
		const { context, echo, plucks } = start();

		await context.resume();
		// A stop pressed while the context resumed wins
		if (current !== runs) return;

		echo.update(paramsOf(controls));
		echo.fade(true);
		plucks.restart();
		loop.start();
	}

	return {
		restart: () => engine?.plucks.restart(),
		run,
		update: () => engine?.echo.update(paramsOf(controls)),
	};
}

function bindEcho(panel: Element): void {
	const controls = readControls(panel);
	const { bpm, heads, mode, play, tapKey } = controls;
	const transport = createTransport(controls);
	const clock: TapClock = { beatMs: beatMsOf(bpm.value), phaseAt: 0, taps: [] };

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
	tapKey.addEventListener('change', () => {
		if (!tapKey.pressed) return;

		tap(clock, performance.now());
		if (clock.taps.length > 1) bpm.value = Math.round(600_000 / clock.beatMs) / 10;
		transport.restart();
		transport.update();
	});
	play.addEventListener('change', () => {
		void transport.run(play.pressed);
	});
	dimSecondHead(controls);
}

const panel = document.querySelector('[data-tape-echo]');

if (panel) bindEcho(panel);
