import {
	crossfadeGains,
	SonicDial,
	SonicKey,
	SonicLever,
	SonicMeter,
	SonicSlider,
} from '@xsynaptic/sonic-ui';

import type { ControlsOf } from '#scripts/find.ts';

import { gainOrSilence, levelAt } from '#scripts/demo-signal.ts';
import { dataHook, find, readControls } from '#scripts/find.ts';
import { bindRun, frameLoop } from '#scripts/frame-loop.ts';
import { beatMsOf, createTapTempo } from '#scripts/tap-tempo.ts';

const filterSpec = {
	double: SonicKey,
	frequency: SonicDial,
	lfoDepth: SonicDial,
	lfoOn: SonicKey,
	tap: SonicKey,
};

interface FilterClock extends ControlsOf<typeof filterSpec> {
	led: HTMLElement;
	tempo: ReturnType<typeof createTapTempo>;
}

interface Channel {
	assign: SonicLever;
	fader: SonicSlider;
	level: SonicDial;
	meter: SonicMeter;
}

interface Desk {
	channels: Array<Channel>;
	crossfadeCurve: SonicDial;
	crossfader: SonicSlider;
	tempo: SonicDial;
}

const sourceGain = 0.5;
const lfoOctaves = 3;

function bindClock(section: HTMLElement, bpm: number): FilterClock {
	const controls = readControls(section, filterSpec, dataHook);
	const tempo = createTapTempo(bpm);

	controls.tap.addEventListener('change', () => {
		if (controls.tap.pressed) tempo.tap(performance.now());
	});

	return { ...controls, led: find(controls.tap, ':scope > .sonic-led', HTMLElement), tempo };
}

function tickClock(clock: FilterClock, time: number): void {
	const beat = clock.tempo.phaseAt(time);
	const phase = clock.double.pressed ? (beat * 2) % 1 : beat;
	const { frequency } = clock;

	clock.led.toggleAttribute('data-sonic-lit', phase < 0.5);
	if (!clock.lfoOn.pressed) {
		frequency.modulated = undefined;
		return;
	}

	const swing = 2 ** ((clock.lfoDepth.value / 100) * lfoOctaves * Math.sin(phase * 2 * Math.PI));

	frequency.modulated = frequency.value * swing;
}

function tickSignal(desk: Desk, time: number): [number, number] {
	const beatMs = beatMsOf(desk.tempo.value);
	const { a, b } = crossfadeGains(desk.crossfader.value / 100, {
		sharpness: desk.crossfadeCurve.value / 100,
	});
	const sides = new Map([
		['off', 1],
		['x', a],
		['y', b],
	]);
	const mix: [number, number] = [0, 0];

	for (const [index, channel] of desk.channels.entries()) {
		const level = gainOrSilence(channel.level.value) * sourceGain;
		const post = gainOrSilence(channel.fader.value) * (sides.get(channel.assign.value) ?? 0);
		const left = levelAt(time, index, beatMs) * level;
		const right = levelAt(time, index + 0.4, beatMs) * level;

		channel.meter.level = Math.max(left, right);
		mix[0] += left * post;
		mix[1] += right * post;
	}

	return mix;
}

function bindMixer(mixer: Element): void {
	const { crossfadeCurve, crossfader, masterMix, start, tempo } = readControls(
		mixer,
		{
			crossfadeCurve: SonicDial,
			crossfader: SonicSlider,
			masterMix: SonicDial,
			start: SonicKey,
			tempo: SonicDial,
		},
		dataHook,
	);
	const masterMeters = [...mixer.querySelectorAll<SonicMeter>(':scope [data-master-meter]')];
	const channels = [...mixer.querySelectorAll<HTMLElement>(':scope [data-channel]')].map(
		(strip): Channel => ({
			assign: find(strip, ':scope [data-crossfade-assign]', SonicLever),
			fader: find(strip, ':scope [data-channel-fader]', SonicSlider),
			level: find(strip, ':scope [data-channel-level]', SonicDial),
			meter: find(strip, ':scope [data-channel-meter]', SonicMeter),
		}),
	);
	const mics = [...mixer.querySelectorAll<HTMLElement>(':scope [data-mic]')].map((strip) => ({
		fader: find(strip, ':scope [data-channel-fader]', SonicSlider),
		led: find(strip, ':scope [data-mic-led]', HTMLElement),
		switch: find(strip, ':scope [data-mic-switch]', SonicLever),
	}));
	const desk: Desk = { channels, crossfadeCurve, crossfader, tempo };
	const clocks = [...mixer.querySelectorAll<HTMLElement>(':scope [data-filter]')].map((section) =>
		bindClock(section, tempo.value),
	);
	const loop = frameLoop((_elapsedSeconds, time) => {
		const mix = tickSignal(desk, time);

		for (const [index, meter] of masterMeters.entries()) {
			meter.level = (mix[index] ?? 0) * (masterMix.value / 7);
		}
		for (const mic of mics) {
			if (mic.switch.value !== 'off' && mic.fader.value > -60) mic.led.dataset.sonicLit = 'alt';
			else delete mic.led.dataset.sonicLit;
		}
		for (const clock of clocks) tickClock(clock, time);
	});

	bindRun([start], {
		start: loop.start,
		stop: () => {
			loop.stop();
			for (const meter of mixer.querySelectorAll<SonicMeter>(':scope sonic-meter')) {
				meter.level = 0;
			}
			for (const led of [...mics.map((mic) => mic.led), ...clocks.map((clock) => clock.led)]) {
				delete led.dataset.sonicLit;
			}
			for (const clock of clocks) clock.frequency.modulated = undefined;
		},
	});
}

function bindCueActive(mixer: Element): void {
	const led = find(mixer, ':scope [data-cue-active]', Element);
	const cues = [...mixer.querySelectorAll<SonicKey>(':scope [data-cue]')];

	mixer.addEventListener('change', () => {
		led.toggleAttribute(
			'data-sonic-lit',
			cues.some((cue) => cue.pressed),
		);
	});
}

const mixer = document.querySelector('[data-club-mixer]');

if (mixer) {
	bindMixer(mixer);
	bindCueActive(mixer);
}
