import type { echoModes } from '#scripts/stop-names.ts';
import type { ToneAudioNode } from '#scripts/tone.ts';

import {
	BiquadFilter,
	Compressor,
	Delay,
	Gain,
	Oscillator,
	Panner,
	WaveShaper,
} from '#scripts/tone.ts';

type EchoMode = NonNullable<ReturnType<typeof echoModes.valueAt>>;

export interface EchoParams {
	feedback: number;
	feel: number;
	groove: number;
	highCut: number;
	input: number;
	lowCut: number;
	mix: number;
	mode: EchoMode;
	output: number;
	saturation: number;
	style: number;
	times: [number, number];
}

interface Head {
	delay: Delay;
	feedback: Gain;
	highCut: BiquadFilter;
	lowCut: BiquadFilter;
	pan: Panner;
	shaper: WaveShaper;
}

interface Bus {
	drive: Gain;
	dry: Gain;
	input: Gain;
	master: Gain;
	meters: { input: AnalyserNode; output: AnalyserNode };
	output: Gain;
	push: Gain;
	spectrum: AnalyserNode;
	wet: Gain;
}

interface Rhythm {
	inlet: Gain;
	outlet: Gain;
	taps: Array<{ delay: Delay; step: number }>;
}

interface Graph {
	bus: Bus;
	heads: readonly [Head, Head];
	rhythm: Rhythm;
	wobble: { depth: Gain; oscillator: Oscillator };
}

interface Glidable {
	setTargetAtTime(value: number, startTime: number, timeConstant: number): unknown;
}

type Glide = (param: Glidable, value: number, time?: number) => void;

type Link = [ToneAudioNode, ToneAudioNode];

const clean = { ceiling: 20_000, drive: 1, floor: 20, wobbleHz: 0.1, wobbleMs: 0 };
const styles = [
	clean,
	{ ceiling: 9000, drive: 1.6, floor: 40, wobbleHz: 0.6, wobbleMs: 0.5 },
	{ ceiling: 6000, drive: 2.4, floor: 60, wobbleHz: 0.9, wobbleMs: 2 },
	{ ceiling: 4500, drive: 1.3, floor: 30, wobbleHz: 0.3, wobbleMs: 0.3 },
	{ ceiling: 3500, drive: 3, floor: 120, wobbleHz: 1.4, wobbleMs: 1.2 },
	{ ceiling: 2800, drive: 3.5, floor: 400, wobbleHz: 4, wobbleMs: 0.2 },
];
const rhythmTaps = [
	{ level: 1, step: 1 },
	{ level: 0.5, step: 1.5 },
	{ level: 0.75, step: 2.5 },
	{ level: 0.4, step: 3 },
];
const pans = { dual: 0.35, 'ping-pong': 1, rhythm: 0, single: 0 };
const rhythmLoop = 4;
const maxDelaySeconds = 12;
const feelSeconds = 0.025;
const loopGain = 1.05;
const glide = 0.15;
const smoothing = 0.03;
const curveLength = 2049;
const maxDrive = 10;

function gainOf(decibels: number): number {
	return 10 ** (decibels / 20);
}

// The compressor adds makeup gain that cannot be switched off, which lifts a limited peak past full scale
const makeupTrim = gainOf(-2);

function clampTime(seconds: number): number {
	return Math.min(maxDelaySeconds - 0.1, Math.max(0.005, seconds));
}

function createHead(): Head {
	const head: Head = {
		delay: new Delay({ maxDelay: maxDelaySeconds }),
		feedback: new Gain(),
		highCut: new BiquadFilter({ type: 'lowpass' }),
		lowCut: new BiquadFilter({ type: 'highpass' }),
		pan: new Panner({ channelCount: 2 }),
		shaper: new WaveShaper(),
	};

	head.shaper.oversample = '2x';
	// Tone's panner folds a stereo file to mono without this
	head.pan.input.channelCountMode = 'clamped-max';
	head.delay.chain(head.lowCut, head.highCut, head.shaper, head.pan);
	head.shaper.connect(head.feedback);

	return head;
}

function createBus(context: AudioContext): Bus {
	const bus: Bus = {
		drive: new Gain(),
		dry: new Gain(),
		input: new Gain(),
		master: new Gain(0),
		meters: {
			input: new AnalyserNode(context, { fftSize: 1024 }),
			output: new AnalyserNode(context, { fftSize: 1024 }),
		},
		output: new Gain(),
		push: new Gain(),
		// Unsmoothed, so the fall on show is the display's own
		spectrum: new AnalyserNode(context, { fftSize: 4096, smoothingTimeConstant: 0 }),
		wet: new Gain(),
	};
	const shaper = new WaveShaper();
	const limiter = new Compressor({
		attack: 0.002,
		knee: 0,
		ratio: 20,
		release: 0.25,
		threshold: -3,
	});

	// One fixed curve between two gains; swapping curves as the dial turns crackles
	shaper.setMap((x) => Math.tanh(maxDrive * x), curveLength);
	shaper.oversample = '2x';
	bus.input.fan(bus.meters.input, bus.dry, bus.push);
	bus.push.chain(shaper, bus.drive);
	bus.dry.connect(bus.output);
	bus.wet.connect(bus.output);
	bus.output.fan(bus.meters.output, bus.spectrum, limiter);
	limiter.connect(bus.master);
	bus.master.toDestination();

	return bus;
}

function createRhythm(): Rhythm {
	const inlet = new Gain();
	const outlet = new Gain();
	const taps = rhythmTaps.map((tap) => {
		const delay = new Delay({ maxDelay: maxDelaySeconds });

		inlet.chain(delay, new Gain(tap.level), outlet);

		return { delay, step: tap.step };
	});

	return { inlet, outlet, taps };
}

function createGraph(context: AudioContext): Graph {
	const heads = [createHead(), createHead()] as const;
	const oscillator = new Oscillator();
	const depth = new Gain(0);

	oscillator.connect(depth);
	for (const head of heads) depth.connect(head.delay.delayTime);
	oscillator.start();

	return {
		bus: createBus(context),
		heads,
		rhythm: createRhythm(),
		wobble: { depth, oscillator },
	};
}

function linksFor(mode: EchoMode, { bus, heads, rhythm }: Graph): Array<Link> {
	const [first, second] = heads;

	if (mode === 'rhythm') {
		return [
			[bus.drive, rhythm.inlet],
			[rhythm.inlet, first.delay],
			[first.feedback, rhythm.inlet],
			[rhythm.outlet, bus.wet],
		];
	}

	const heard: Array<Link> = [
		[bus.drive, first.delay],
		[first.pan, bus.wet],
		[second.pan, bus.wet],
	];

	if (mode === 'dual') {
		return [
			...heard,
			[bus.drive, second.delay],
			[first.feedback, first.delay],
			[second.feedback, second.delay],
		];
	}

	return [...heard, [first.feedback, second.delay], [second.feedback, first.delay]];
}

function headTimes({ feel, groove, mode, times }: EchoParams): [number, number] {
	const [time, otherTime] = times;
	const swing = groove / 100;
	const push = (feel / 50) * feelSeconds;

	if (mode === 'rhythm') return [clampTime(time * rhythmLoop + push), time];

	const secondTime = mode === 'dual' ? otherTime : time;

	return [clampTime(time * (1 + swing) + push), clampTime(secondTime * (1 - swing) + push)];
}

function updateHeads({ heads, rhythm }: Graph, params: EchoParams, glideTo: Glide): void {
	const style = styles[params.style] ?? clean;
	const spread = pans[params.mode];
	const [firstTime, secondTime] = headTimes(params);

	for (const [head, time, pan] of [
		[heads[0], firstTime, -spread],
		[heads[1], secondTime, spread],
	] as const) {
		glideTo(head.delay.delayTime, time, glide);
		glideTo(head.feedback.gain, (params.feedback / 100) * loopGain);
		glideTo(head.lowCut.frequency, Math.max(params.lowCut, style.floor));
		glideTo(head.highCut.frequency, Math.min(params.highCut, style.ceiling));
		glideTo(head.pan.pan, pan);
	}
	for (const tap of rhythm.taps) {
		glideTo(tap.delay.delayTime, clampTime(params.times[0] * tap.step), glide);
	}
}

function updateLevels({ bus, wobble }: Graph, params: EchoParams, glideTo: Glide): void {
	const style = styles[params.style] ?? clean;
	const mixAngle = (params.mix / 100) * (Math.PI / 2);
	const drive = 1 + (params.saturation / 100) * (maxDrive - 1);

	glideTo(wobble.oscillator.frequency, style.wobbleHz);
	glideTo(wobble.depth.gain, style.wobbleMs / 1000);
	glideTo(bus.input.gain, gainOf(params.input));
	glideTo(bus.push.gain, drive / maxDrive);
	glideTo(bus.drive.gain, 1 / Math.sqrt(drive));
	glideTo(bus.output.gain, gainOf(params.output));
	glideTo(bus.dry.gain, Math.cos(mixAngle));
	glideTo(bus.wet.gain, Math.sin(mixAngle));
}

function updateCurves({ heads }: Graph, params: EchoParams, previous?: EchoParams): void {
	if (params.style === previous?.style) return;

	const { drive } = styles[params.style] ?? clean;

	for (const head of heads) head.shaper.setMap((x) => Math.tanh(drive * x) / drive, curveLength);
}

export function createEcho(context: AudioContext) {
	const graph = createGraph(context);
	let links: Array<Link> = [];
	let previous: EchoParams | undefined;

	const glideTo: Glide = (param, value, time = smoothing) => {
		param.setTargetAtTime(value, context.currentTime, time);
	};

	function update(params: EchoParams): void {
		if (params.mode !== previous?.mode) {
			for (const [from, to] of links) from.disconnect(to);
			links = linksFor(params.mode, graph);
			for (const [from, to] of links) from.connect(to);
		}
		updateCurves(graph, params, previous);
		updateHeads(graph, params, glideTo);
		updateLevels(graph, params, glideTo);
		previous = params;
	}

	function fade(isOn: boolean): void {
		glideTo(graph.bus.master.gain, isOn ? makeupTrim : 0);
	}

	return {
		fade,
		input: graph.bus.input.input,
		meters: graph.bus.meters,
		spectrum: graph.bus.spectrum,
		update,
	};
}

export type Echo = ReturnType<typeof createEcho>;
