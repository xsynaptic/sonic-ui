import type { SonicDial, SonicKey, SonicLever, SonicMeter, SonicSlider } from '@xsynaptic/sonic-ui';

import type { TapClock } from '#scripts/tap-tempo.ts';

import { gainOf, levelAt } from '#scripts/demo-signal.ts';
import { find } from '#scripts/find.ts';
import { frameLoop, isMotionAllowed } from '#scripts/frame-loop.ts';
import { beatMsOf, tap } from '#scripts/tap-tempo.ts';

interface FilterClock extends TapClock {
	depth: SonicDial;
	double: SonicKey;
	frequency: SonicDial;
	led: HTMLElement;
	lfo: SonicKey;
}

interface Channel {
	assign: SonicLever;
	fader: SonicSlider;
	level: SonicDial;
	meter: SonicMeter;
}

interface Desk {
	channels: Array<Channel>;
	crossfader: SonicSlider;
	tempo: SonicDial;
}

// −6 dB keeps the demo signal's peaks in the amber, with an occasional clip
const sourceGain = 0.5;
const lfoOctaves = 3;

function bindClock(section: HTMLElement, beatMs: number): FilterClock {
	const tapKey = find<SonicKey>(section, ':scope [data-tap]');
	const clock: FilterClock = {
		beatMs,
		depth: find(section, ':scope [data-lfo-depth]'),
		double: find(section, ':scope [data-double]'),
		frequency: find(section, ':scope [data-frequency]'),
		led: find<HTMLElement>(tapKey, ':scope .sonic-led'),
		lfo: find(section, ':scope [data-lfo-on]'),
		phaseAt: 0,
		taps: [],
	};

	tapKey.addEventListener('change', () => {
		if (tapKey.pressed) tap(clock, performance.now());
	});

	return clock;
}

function tickClock(clock: FilterClock, time: number): void {
	const beatMs = clock.double.pressed ? clock.beatMs / 2 : clock.beatMs;
	const phase = ((((time - clock.phaseAt) % beatMs) + beatMs) % beatMs) / beatMs;
	const { frequency } = clock;

	clock.led.toggleAttribute('data-sonic-lit', phase < 0.5);
	if (!clock.lfo.pressed) {
		frequency.removeAttribute('modulation');
		return;
	}

	const swing = 2 ** ((clock.depth.value / 100) * lfoOctaves * Math.sin(phase * 2 * Math.PI));

	frequency.modulation = Math.round(frequency.value * swing - frequency.value);
}

function tickSignal(desk: Desk, time: number): [number, number] {
	const beatMs = beatMsOf(desk.tempo.value);
	const position = (desk.crossfader.value / 100) * (Math.PI / 2);
	const sides = new Map([
		['off', 1],
		['x', Math.cos(position)],
		['y', Math.sin(position)],
	]);
	const mix: [number, number] = [0, 0];

	for (const [index, channel] of desk.channels.entries()) {
		const level = gainOf(channel.level.value) * sourceGain;
		const post = gainOf(channel.fader.value) * (sides.get(channel.assign.value) ?? 0);
		const left = levelAt(time, index, beatMs) * level;
		const right = levelAt(time, index + 0.4, beatMs) * level;

		channel.meter.level = Math.max(left, right);
		mix[0] += left * post;
		mix[1] += right * post;
	}

	return mix;
}

function bindMixer(mixer: Element): void {
	const tempo = find<SonicDial>(mixer, ':scope [data-tempo]');
	const start = find<SonicKey>(mixer, ':scope [data-start]');
	const crossfader = find<SonicSlider>(mixer, ':scope [data-crossfader]');
	const masterMix = find<SonicDial>(mixer, ':scope [data-master-mix]');
	const masterMeters = [...mixer.querySelectorAll<SonicMeter>(':scope [data-master-meter]')];
	const channels = [...mixer.querySelectorAll<HTMLElement>(':scope [data-channel]')].map(
		(strip): Channel => ({
			assign: find(strip, ':scope [data-crossfade-assign]'),
			fader: find(strip, ':scope [data-channel-fader]'),
			level: find(strip, ':scope [data-channel-level]'),
			meter: find(strip, ':scope [data-channel-meter]'),
		}),
	);
	const mics = [...mixer.querySelectorAll<HTMLElement>(':scope [data-mic]')].map((strip) => ({
		fader: find<SonicSlider>(strip, ':scope [data-channel-fader]'),
		led: find<HTMLElement>(strip, ':scope [data-mic-led]'),
		switch: find<SonicLever>(strip, ':scope [data-mic-switch]'),
	}));
	const desk: Desk = { channels, crossfader, tempo };
	const clocks = [...mixer.querySelectorAll<HTMLElement>(':scope [data-filter]')].map((section) =>
		bindClock(section, beatMsOf(tempo.value)),
	);
	const loop = frameLoop((time) => {
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

	const run = (isRunning: boolean): void => {
		start.pressed = isRunning;
		if (isRunning) {
			loop.start();
			return;
		}

		loop.stop();
		for (const meter of mixer.querySelectorAll<SonicMeter>(':scope sonic-meter')) meter.level = 0;
		for (const led of [...mics.map((mic) => mic.led), ...clocks.map((clock) => clock.led)]) {
			delete led.dataset.sonicLit;
		}
		for (const clock of clocks) clock.frequency.removeAttribute('modulation');
	};

	start.addEventListener('change', () => {
		run(start.pressed);
	});
	run(isMotionAllowed());
}

function bindCueActive(mixer: Element): void {
	const led = find(mixer, ':scope [data-cue-active]');
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
