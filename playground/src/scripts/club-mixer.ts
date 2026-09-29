import type { SonicDial, SonicKey, SonicMeter, SonicSlider } from '@xsynaptic/sonic-ui';

import { gainOf, levelAt } from '#scripts/demo-signal.ts';

interface FilterClock {
	beatMs: number;
	depth: SonicDial;
	double: SonicKey;
	frequency: SonicDial;
	led: HTMLElement;
	lfo: SonicKey;
	phaseAt: number;
	taps: Array<number>;
}

interface Channel {
	fader: SonicSlider;
	level: SonicDial;
	meter: SonicMeter;
	side: number;
}

interface Desk {
	channels: Array<Channel>;
	crossfader: SonicSlider;
	tempo: SonicDial;
}

// −6 dB keeps the demo signal's peaks in the amber, with an occasional clip
const sourceGain = 0.5;
const lfoOctaves = 3;
const tapWindowMs = 2000;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- mirrors `querySelector<T>`, whose selector cannot carry the type
function find<T extends Element>(root: ParentNode, selector: string): T {
	const found = root.querySelector<T>(selector);
	if (!found) throw new Error(`The club mixer has no ${selector}`);

	return found;
}

function beatMsOf(bpm: number): number {
	return 60_000 / Math.min(250, Math.max(40, bpm));
}

function tap(clock: FilterClock, now: number): void {
	const taps = [...clock.taps.filter((time) => now - time < tapWindowMs), now].slice(-5);

	clock.taps = taps;
	clock.phaseAt = now;

	const first = taps[0];
	if (first === undefined || taps.length < 2) return;

	clock.beatMs = beatMsOf(60_000 / ((now - first) / (taps.length - 1)));
}

function readClock(section: HTMLElement, beatMs: number): FilterClock {
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

// Channel meters read before the fader, as the hardware's do; the master reads after the crossfader
function tickSignal(desk: Desk, time: number): [number, number] {
	const beatMs = beatMsOf(desk.tempo.value);
	const position = (desk.crossfader.value / 100) * (Math.PI / 2);
	const sides = [Math.cos(position), Math.sin(position)];
	const mix: [number, number] = [0, 0];

	for (const [index, channel] of desk.channels.entries()) {
		const level = gainOf(channel.level.value) * sourceGain;
		const post = gainOf(channel.fader.value) * (sides[channel.side] ?? 0);
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
	// Channels 1 and 2 ride the X side and 3 and 4 the Y side while the assign levers are ghosts
	const channels = [...mixer.querySelectorAll<HTMLElement>(':scope [data-channel]')].map(
		(strip, index): Channel => ({
			fader: find(strip, ':scope [data-channel-fader]'),
			level: find(strip, ':scope [data-channel-level]'),
			meter: find(strip, ':scope [data-channel-meter]'),
			side: index < 2 ? 0 : 1,
		}),
	);
	const mics = [...mixer.querySelectorAll<HTMLElement>(':scope [data-mic]')].map((strip) => ({
		fader: find<SonicSlider>(strip, ':scope [data-channel-fader]'),
		led: find<HTMLElement>(strip, ':scope [data-mic-led]'),
	}));
	const desk: Desk = { channels, crossfader, tempo };
	const clocks = [...mixer.querySelectorAll<HTMLElement>(':scope [data-filter]')].map((section) =>
		readClock(section, beatMsOf(tempo.value)),
	);
	let frame: number | undefined;

	const tick = (time: number): void => {
		const mix = tickSignal(desk, time);

		for (const [index, meter] of masterMeters.entries()) {
			meter.level = (mix[index] ?? 0) * (masterMix.value / 7);
		}
		for (const mic of mics) {
			if (mic.fader.value > -60) mic.led.dataset.sonicLit = 'alt';
			else delete mic.led.dataset.sonicLit;
		}
		for (const clock of clocks) tickClock(clock, time);
		frame = requestAnimationFrame(tick);
	};

	const run = (isRunning: boolean): void => {
		start.pressed = isRunning;
		if (frame !== undefined) cancelAnimationFrame(frame);
		frame = isRunning ? requestAnimationFrame(tick) : undefined;
		if (isRunning) return;

		for (const meter of mixer.querySelectorAll<SonicMeter>(':scope sonic-meter')) meter.level = 0;
		for (const led of [...mics.map((mic) => mic.led), ...clocks.map((clock) => clock.led)]) {
			delete led.dataset.sonicLit;
		}
		for (const clock of clocks) clock.frequency.removeAttribute('modulation');
	};

	start.addEventListener('change', () => {
		run(start.pressed);
	});
	run(!matchMedia('(prefers-reduced-motion: reduce)').matches);
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
