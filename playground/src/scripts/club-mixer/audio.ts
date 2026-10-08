import { crossfadeGains } from '@xsynaptic/sonic-ui';

import { gainOrSilence } from '#scripts/demo-signal.ts';
import { BiquadFilter, Compressor, Gain, LFO, Split } from '#scripts/tone.ts';

interface ChannelParams {
	bands: Array<number>;
	fader: number;
	filter: string;
	level: number;
	side: string;
}

interface FilterParams {
	depth: number;
	frequency: number;
	isDouble: boolean;
	isLfoOn: boolean;
	isOn: boolean;
	passes: Array<string>;
	resonance: number;
}

export interface DeskParams {
	channels: Array<ChannelParams>;
	crossfader: number;
	curve: number;
	filters: Array<FilterParams>;
	master: number;
	tempo: number;
}

interface Glidable {
	setTargetAtTime(value: number, startTime: number, timeConstant: number): unknown;
}

type Glide = (param: Glidable, value: number) => void;

const bandSpecs = [
	{ frequency: 6000, type: 'highshelf' },
	{ frequency: 2200, Q: 0.8, type: 'peaking' },
	{ frequency: 400, Q: 0.8, type: 'peaking' },
	{ frequency: 140, type: 'lowshelf' },
] as const;
// A biquad's Q is a peak in decibels on the low-pass and high-pass, and a width on the band-pass
const passSpecs = [
	{ name: 'high-pass', resonance: [0, 24], type: 'highpass' },
	{ name: 'band-pass', resonance: [0.7, 12], type: 'bandpass' },
	{ name: 'low-pass', resonance: [0, 24], type: 'lowpass' },
] as const;
const lfoOctaves = 3;
const centsPerOctave = 1200;
const unityMaster = 7;
const smoothing = 0.02;
// The compressor adds makeup gain that cannot be switched off, which lifts a limited peak past full scale
const makeupTrim = gainOrSilence(-2);

function createChannel(context: AudioContext, outlets: ReadonlyMap<string, Gain>) {
	const level = new Gain();
	const meter = new AnalyserNode(context, { fftSize: 1024 });
	const bands = bandSpecs.map((spec) => new BiquadFilter(spec));
	const post = new Gain(0);
	const sends = [...outlets].map(([name, outlet]) => {
		const send = new Gain(0);

		post.chain(send, outlet);

		return { name, send };
	});

	level.connect(meter);
	level.chain(...bands, post);

	return {
		input: level.input,
		meter,
		update(params: ChannelParams, sideGain: number, glideTo: Glide): void {
			glideTo(level.gain, gainOrSilence(params.level));
			glideTo(post.gain, gainOrSilence(params.fader) * sideGain);
			for (const [index, band] of bands.entries()) glideTo(band.gain, params.bands[index] ?? 0);
			for (const { name, send } of sends) glideTo(send.gain, name === params.filter ? 1 : 0);
		},
	};
}

function createFilter(context: AudioContext, mix: Gain) {
	const input = new Gain();
	const dry = new Gain();
	const wet = new Gain(0);
	const lfo = new LFO({ max: 0, min: 0 });
	const probe = new AnalyserNode(context, { fftSize: 32 });
	const samples = new Float32Array(probe.fftSize);
	const passes = passSpecs.map((spec) => {
		const filter = new BiquadFilter({ type: spec.type });
		const gate = new Gain(0);

		input.chain(filter, gate, wet);
		lfo.connect(filter.detune);

		return { filter, gate, spec };
	});

	input.chain(dry, mix);
	wet.connect(mix);
	lfo.connect(probe);

	return {
		cents(): number {
			probe.getFloatTimeDomainData(samples);

			return samples.at(-1) ?? 0;
		},
		input,
		lfo,
		update(params: FilterParams, beatHz: number, glideTo: Glide): void {
			const swing = params.isLfoOn ? (params.depth / 100) * lfoOctaves * centsPerOctave : 0;

			lfo.min = -swing;
			lfo.max = swing;
			lfo.frequency.value = beatHz * (params.isDouble ? 2 : 1);
			glideTo(dry.gain, params.isOn ? 0 : 1);
			glideTo(wet.gain, params.isOn ? 1 : 0);
			for (const { filter, gate, spec } of passes) {
				const [mild, wild] = spec.resonance;

				glideTo(filter.frequency, params.frequency);
				glideTo(filter.Q, mild + (wild - mild) * (params.resonance / 100));
				glideTo(gate.gain, params.passes.includes(spec.name) ? 1 : 0);
			}
		},
	};
}

function createMaster(context: AudioContext) {
	const master = {
		level: new Gain(0),
		meters: [
			new AnalyserNode(context, { fftSize: 1024 }),
			new AnalyserNode(context, { fftSize: 1024 }),
		],
		mix: new Gain(),
		outlet: new Gain(0),
	};
	const split = new Split();
	const limiter = new Compressor({
		attack: 0.002,
		knee: 0,
		ratio: 20,
		release: 0.1,
		threshold: -3,
	});

	master.mix.chain(master.level, limiter, master.outlet);
	master.outlet.toDestination();
	master.level.connect(split);
	for (const [side, meter] of master.meters.entries()) split.connect(meter, side);

	return master;
}

export function createDesk(context: AudioContext, channelCount: number) {
	const master = createMaster(context);
	const filters = [createFilter(context, master.mix), createFilter(context, master.mix)];
	const outlets = new Map([
		['off', master.mix],
		...filters.map((filter, index): [string, Gain] => [String(index + 1), filter.input]),
	]);
	const channels = Array.from({ length: channelCount }, () => createChannel(context, outlets));

	const glideTo: Glide = (param, value) => {
		param.setTargetAtTime(value, context.currentTime, smoothing);
	};

	return {
		channels,
		filters,
		masterMeters: master.meters,
		run(isRunning: boolean): void {
			glideTo(master.outlet.gain, isRunning ? makeupTrim : 0);
			for (const { lfo } of filters) {
				if (isRunning) lfo.start();
				else lfo.stop();
			}
		},
		update(params: DeskParams): void {
			const { a, b } = crossfadeGains(params.crossfader / 100, { sharpness: params.curve / 100 });
			const sides = new Map([
				['off', 1],
				['x', a],
				['y', b],
			]);

			glideTo(master.level.gain, params.master / unityMaster);
			for (const [index, channel] of channels.entries()) {
				const strip = params.channels[index];

				if (strip) channel.update(strip, sides.get(strip.side) ?? 0, glideTo);
			}
			for (const [index, filter] of filters.entries()) {
				const section = params.filters[index];

				if (section) filter.update(section, params.tempo / 60, glideTo);
			}
		},
	};
}
