import { SonicButton, SonicDial, SonicMeter, SonicSlider, SonicSwitch } from '@xsynaptic/sonic-ui';

import type { DeskParams } from '#scripts/club-mixer/audio.ts';
import type { ControlsOf } from '#scripts/find.ts';

import { peakOf } from '#scripts/analyser-peak.ts';
import { createDesk } from '#scripts/club-mixer/audio.ts';
import { createStems } from '#scripts/club-mixer/stems.ts';
import { dataHook, find, readControls } from '#scripts/find.ts';
import { frameLoop } from '#scripts/frame-loop.ts';
import { createTapTempo } from '#scripts/tap-tempo.ts';
import { createContext } from '#scripts/tone.ts';

const filterSpec = {
	double: SonicButton,
	filterOn: SonicButton,
	frequency: SonicDial,
	lfoDepth: SonicDial,
	lfoOn: SonicButton,
	resonance: SonicDial,
	tap: SonicButton,
};

const deskSpec = {
	crossfadeCurve: SonicDial,
	crossfader: SonicSlider,
	masterMix: SonicDial,
	start: SonicButton,
	tempo: SonicDial,
};

interface FilterSection extends ControlsOf<typeof filterSpec> {
	led: HTMLElement;
	passes: Array<SonicButton>;
}

interface Channel {
	assign: SonicSwitch;
	bands: Array<SonicDial>;
	fader: SonicSlider;
	filter: SonicSwitch;
	level: SonicDial;
	meter: SonicMeter;
}

interface Mic {
	fader: SonicSlider;
	led: HTMLElement;
	switch: SonicSwitch;
}

interface Controls extends ControlsOf<typeof deskSpec> {
	channels: Array<Channel>;
	filters: Array<FilterSection>;
	masterMeters: Array<SonicMeter>;
	mics: Array<Mic>;
}

type Engine = ReturnType<typeof createEngine>;

function readFilter(section: HTMLElement): FilterSection {
	const controls = readControls(section, filterSpec, dataHook);

	return {
		...controls,
		led: find(controls.tap, ':scope > .sonic-led', HTMLElement),
		passes: [...section.querySelectorAll<SonicButton>(':scope [data-pass]')],
	};
}

function readMixer(mixer: Element): Controls {
	return {
		...readControls(mixer, deskSpec, dataHook),
		channels: [...mixer.querySelectorAll<HTMLElement>(':scope [data-channel]')].map((strip) => ({
			assign: find(strip, ':scope [data-crossfade-assign]', SonicSwitch),
			bands: [...strip.querySelectorAll<SonicDial>(':scope [data-channel-band]')],
			fader: find(strip, ':scope [data-channel-fader]', SonicSlider),
			filter: find(strip, ':scope [data-filter-assign]', SonicSwitch),
			level: find(strip, ':scope [data-channel-level]', SonicDial),
			meter: find(strip, ':scope [data-channel-meter]', SonicMeter),
		})),
		filters: [...mixer.querySelectorAll<HTMLElement>(':scope [data-filter]')].map((section) =>
			readFilter(section),
		),
		masterMeters: [...mixer.querySelectorAll<SonicMeter>(':scope [data-master-meter]')],
		mics: [...mixer.querySelectorAll<HTMLElement>(':scope [data-mic]')].map((strip) => ({
			fader: find(strip, ':scope [data-channel-fader]', SonicSlider),
			led: find(strip, ':scope [data-mic-led]', HTMLElement),
			switch: find(strip, ':scope [data-mic-switch]', SonicSwitch),
		})),
	};
}

function paramsOf(controls: Controls): DeskParams {
	return {
		channels: controls.channels.map((channel) => ({
			bands: channel.bands.map((band) => band.value),
			fader: channel.fader.value,
			filter: channel.filter.value,
			level: channel.level.value,
			side: channel.assign.value,
		})),
		crossfader: controls.crossfader.value,
		curve: controls.crossfadeCurve.value,
		filters: controls.filters.map((section) => ({
			depth: section.lfoDepth.value,
			frequency: section.frequency.value,
			isDouble: section.double.pressed,
			isLfoOn: section.lfoOn.pressed,
			isOn: section.filterOn.pressed,
			passes: section.passes.filter((pass) => pass.pressed).map((pass) => pass.dataset.pass ?? ''),
			resonance: section.resonance.value,
		})),
		master: controls.masterMix.value,
		tempo: controls.tempo.value,
	};
}

function createEngine(channelCount: number) {
	const context = createContext();
	const desk = createDesk(context, channelCount);

	return {
		context,
		desk,
		sequence: createStems(desk.channels.map((channel) => channel.input)),
	};
}

function tickMeters(
	controls: Controls,
	{ desk }: Engine,
	samples: Float32Array<ArrayBuffer>,
): void {
	for (const [index, channel] of controls.channels.entries()) {
		const analyser = desk.channels[index]?.meter;

		if (analyser) channel.meter.level = peakOf(analyser, samples);
	}
	for (const [index, meter] of controls.masterMeters.entries()) {
		const analyser = desk.masterMeters[index];

		if (analyser) meter.level = peakOf(analyser, samples);
	}
}

function tickMics(mics: Array<Mic>): void {
	for (const mic of mics) {
		if (mic.switch.value !== 'off' && mic.fader.value > -60) mic.led.dataset.sonicLit = 'ok';
		else delete mic.led.dataset.sonicLit;
	}
}

function tickFilters(controls: Controls, { desk, sequence }: Engine): void {
	const beat = sequence.beatPhase();

	for (const [index, section] of controls.filters.entries()) {
		const phase = section.double.pressed ? (beat * 2) % 1 : beat;
		const cents = desk.filters[index]?.cents() ?? 0;

		section.led.toggleAttribute('data-sonic-lit', phase < 0.5);
		section.frequency.modulationValue = section.lfoOn.pressed
			? section.frequency.value * 2 ** (cents / 1200)
			: undefined;
	}
}

function rest(mixer: Element, { filters, mics }: Controls): void {
	for (const meter of mixer.querySelectorAll<SonicMeter>(':scope sonic-meter')) meter.level = 0;
	for (const { led } of [...mics, ...filters]) delete led.dataset.sonicLit;
	for (const section of filters) section.frequency.modulationValue = undefined;
}

function bindMixer(mixer: Element): void {
	const controls = readMixer(mixer);
	const { start, tempo } = controls;
	const taps = createTapTempo(tempo.value);
	const samples = new Float32Array(1024);
	let engine: Engine | undefined;
	let runs = 0;

	const loop = frameLoop(() => {
		if (!engine) return;

		tickMeters(controls, engine, samples);
		tickMics(controls.mics);
		tickFilters(controls, engine);
	});

	function update(): void {
		if (!engine) return;

		engine.sequence.setTempo(tempo.value);
		engine.desk.update(paramsOf(controls));
	}

	async function run(isRunning: boolean): Promise<void> {
		runs += 1;
		if (!isRunning) {
			loop.stop();
			engine?.sequence.stop();
			engine?.desk.run(false);
			rest(mixer, controls);
			return;
		}

		const current = runs;

		engine = engine ?? createEngine(controls.channels.length);
		await engine.context.resume();
		if (current !== runs) return;

		update();
		engine.desk.run(true);
		engine.sequence.start();
		loop.start();
	}

	mixer.addEventListener('input', update);
	mixer.addEventListener('change', update);
	start.addEventListener('change', () => {
		void run(start.pressed);
	});
	for (const { tap } of controls.filters) {
		tap.addEventListener('change', () => {
			const settled = tap.pressed ? taps.tap(performance.now()) : undefined;

			if (settled === undefined) return;

			tempo.value = settled;
			update();
		});
	}
}

function bindCueActive(mixer: Element): void {
	const led = find(mixer, ':scope [data-cue-active]', Element);
	const cues = [...mixer.querySelectorAll<SonicButton>(':scope [data-cue]')];

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
