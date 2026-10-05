import type { echoModes } from '#scripts/stop-names.ts';

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
	delay: DelayNode;
	feedback: GainNode;
	highCut: BiquadFilterNode;
	lowCut: BiquadFilterNode;
	pan: StereoPannerNode;
	shaper: WaveShaperNode;
}

interface Bus {
	drive: WaveShaperNode;
	dry: GainNode;
	input: GainNode;
	master: GainNode;
	meters: { input: AnalyserNode; output: AnalyserNode };
	output: GainNode;
	spectrum: AnalyserNode;
	wet: GainNode;
}

interface Rhythm {
	inlet: GainNode;
	outlet: GainNode;
	taps: Array<{ delay: DelayNode; step: number }>;
}

interface Graph {
	bus: Bus;
	heads: readonly [Head, Head];
	rhythm: Rhythm;
	wobble: { depth: GainNode; oscillator: OscillatorNode };
}

type Glide = (param: AudioParam, value: number, time?: number) => void;

type Link = [AudioNode, AudioNode];

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

function gainOf(decibels: number): number {
	return 10 ** (decibels / 20);
}

function curveOf(shape: (x: number) => number): Float32Array<ArrayBuffer> {
	return Float32Array.from({ length: curveLength }, (_sample, index) =>
		shape((index / (curveLength - 1)) * 2 - 1),
	);
}

function clampTime(seconds: number): number {
	return Math.min(maxDelaySeconds - 0.1, Math.max(0.005, seconds));
}

function createHead(context: AudioContext): Head {
	const head: Head = {
		delay: new DelayNode(context, { maxDelayTime: maxDelaySeconds }),
		feedback: new GainNode(context),
		highCut: new BiquadFilterNode(context, { type: 'lowpass' }),
		lowCut: new BiquadFilterNode(context, { type: 'highpass' }),
		pan: new StereoPannerNode(context),
		shaper: new WaveShaperNode(context, { oversample: '2x' }),
	};

	head.delay.connect(head.lowCut).connect(head.highCut).connect(head.shaper).connect(head.pan);
	head.shaper.connect(head.feedback);

	return head;
}

function createBus(context: AudioContext): Bus {
	const bus: Bus = {
		drive: new WaveShaperNode(context, { oversample: '2x' }),
		dry: new GainNode(context),
		input: new GainNode(context),
		master: new GainNode(context, { gain: 0 }),
		meters: {
			input: new AnalyserNode(context, { fftSize: 1024 }),
			output: new AnalyserNode(context, { fftSize: 1024 }),
		},
		output: new GainNode(context),
		// Unsmoothed, so the fall on show is the display's own
		spectrum: new AnalyserNode(context, { fftSize: 4096, smoothingTimeConstant: 0 }),
		wet: new GainNode(context),
	};
	const limiter = new DynamicsCompressorNode(context, {
		attack: 0.002,
		knee: 0,
		ratio: 20,
		release: 0.1,
		threshold: -6,
	});

	bus.input.connect(bus.meters.input);
	bus.input.connect(bus.dry).connect(bus.output);
	bus.input.connect(bus.drive);
	bus.wet.connect(bus.output);
	bus.output.connect(bus.meters.output);
	bus.output.connect(bus.spectrum);
	bus.output.connect(limiter).connect(bus.master).connect(context.destination);

	return bus;
}

function createRhythm(context: AudioContext): Rhythm {
	const inlet = new GainNode(context);
	const outlet = new GainNode(context);
	const taps = rhythmTaps.map((tap) => {
		const delay = new DelayNode(context, { maxDelayTime: maxDelaySeconds });

		inlet
			.connect(delay)
			.connect(new GainNode(context, { gain: tap.level }))
			.connect(outlet);

		return { delay, step: tap.step };
	});

	return { inlet, outlet, taps };
}

function createGraph(context: AudioContext): Graph {
	const heads = [createHead(context), createHead(context)] as const;
	const oscillator = new OscillatorNode(context);
	const depth = new GainNode(context, { gain: 0 });

	oscillator.connect(depth);
	for (const head of heads) depth.connect(head.delay.delayTime);
	oscillator.start();

	return {
		bus: createBus(context),
		heads,
		rhythm: createRhythm(context),
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

	glideTo(wobble.oscillator.frequency, style.wobbleHz);
	glideTo(wobble.depth.gain, style.wobbleMs / 1000);
	glideTo(bus.input.gain, gainOf(params.input));
	glideTo(bus.output.gain, gainOf(params.output));
	glideTo(bus.dry.gain, Math.cos(mixAngle));
	glideTo(bus.wet.gain, Math.sin(mixAngle));
}

function updateCurves({ bus, heads }: Graph, params: EchoParams, previous?: EchoParams): void {
	if (params.saturation !== previous?.saturation) {
		const drive = 1 + (params.saturation / 100) * 9;

		bus.drive.curve = curveOf((x) => Math.tanh(drive * x) / Math.sqrt(drive));
	}
	if (params.style === previous?.style) return;

	const { drive } = styles[params.style] ?? clean;

	for (const head of heads) head.shaper.curve = curveOf((x) => Math.tanh(drive * x) / drive);
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
		glideTo(graph.bus.master.gain, isOn ? 1 : 0);
	}

	return {
		fade,
		input: graph.bus.input,
		meters: graph.bus.meters,
		spectrum: graph.bus.spectrum,
		update,
	};
}

export type Echo = ReturnType<typeof createEcho>;
