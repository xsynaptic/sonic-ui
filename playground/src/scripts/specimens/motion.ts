import type {
	SonicDial,
	SonicKey,
	SonicMeter,
	SonicNumber,
	SonicSlider,
} from '@xsynaptic/sonic-ui';

import { gainOrSilence, levelAt } from '#scripts/demo-signal.ts';
import { bindRun, frameLoop } from '#scripts/frame-loop.ts';
import { watchPeaks } from '#scripts/specimens/peak-report.ts';

function stripGains(strip: Element): [number, number] {
	const level = strip.querySelector<SonicSlider>('[data-strip-level]');
	const pan = strip.querySelector<SonicDial>('[data-strip-pan]');
	const mute = strip.querySelector<SonicKey>('sonic-key[toggle]');
	if (!level || !pan || mute?.pressed) return [0, 0];

	const gain = gainOrSilence(level.value);
	const position = Math.min(50, Math.max(-50, pan.modulated ?? pan.value)) / 100 + 0.5;

	return [gain * Math.cos((position * Math.PI) / 2), gain * Math.sin((position * Math.PI) / 2)];
}

function pointLevel(meter: SonicMeter, time: number, beatMs: number): number {
	if (meter.dataset.demo === 'reduction') return -18 * levelAt(time, 0, beatMs);

	return 0.3 + 0.6 * Math.sin(time / 1100) * Math.cos(time / 2700);
}

function readSource(selector: string | undefined, fallback: number): number {
	if (!selector) return fallback;

	return document.querySelector<SonicDial>(selector)?.value ?? fallback;
}

function driveMeters(time: number, beatMs: number): void {
	for (const meter of document.querySelectorAll<SonicMeter>('sonic-meter')) {
		if (meter.scale === 'linear') {
			meter.level = pointLevel(meter, time, beatMs);
			continue;
		}

		const channel = meter.previousElementSibling?.localName === 'sonic-meter' ? 1 : 0;
		const strip = meter.closest('[data-strip]');
		const gain = strip ? stripGains(strip)[channel] : 1;

		meter.level = levelAt(time, channel, beatMs) * gain;
	}
}

const lfoControls = document.querySelectorAll<SonicDial | SonicSlider>('[data-lfo]');

function driveLfos(time: number): void {
	for (const control of lfoControls) {
		const rate = readSource(control.dataset.lfoRate, 0.5);
		const depth = readSource(control.dataset.lfoDepth, Number(control.dataset.lfo));
		const swing = Math.sin((time / 1000) * rate * 2 * Math.PI);
		const range = control.modulation;

		control.modulated = control.value + (range === 0 ? depth * swing : (range * (1 + swing)) / 2);
	}
}

function driveRings(time: number, beatMs: number): void {
	for (const ring of document.querySelectorAll<HTMLElement>('[data-ring-loop]')) {
		const isLooping = ring.querySelector<SonicKey>('sonic-key')?.pressed ?? true;
		const position = isLooping ? (time / (beatMs * 4)) % 1 : 0;

		ring.style.setProperty('--sonic-ring-to', position.toFixed(4));
	}
}

function tick(time: number): void {
	const tempo = document.querySelector<SonicNumber>('[data-tempo]')?.value ?? 125;
	const beatMs = 60_000 / tempo;

	driveMeters(time, beatMs);
	watchPeaks();
	driveLfos(time);
	driveRings(time, beatMs);
}

const loop = frameLoop((_elapsedSeconds, time) => {
	tick(time);
});
const setRunning = bindRun([...document.querySelectorAll<SonicKey>('[data-run]')], {
	start: loop.start,
	stop: () => {
		loop.stop();
		for (const control of lfoControls) control.modulated = undefined;
	},
});

for (const stop of document.querySelectorAll('[data-stop]')) {
	stop.addEventListener('click', () => {
		setRunning(false);
	});
}
