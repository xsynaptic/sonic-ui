import type {
	SonicDial,
	SonicKey,
	SonicMeter,
	SonicNumber,
	SonicSlider,
} from '@xsynaptic/sonic-ui';

import { gainOf, levelAt } from '#scripts/demo-signal.ts';

function stripGains(strip: Element): [number, number] {
	const level = strip.querySelector<SonicSlider>('[data-strip-level]');
	const pan = strip.querySelector<SonicDial>('[data-strip-pan]');
	const mute = strip.querySelector<SonicKey>('sonic-key[toggle]');
	if (!level || !pan || mute?.pressed) return [0, 0];

	const gain = gainOf(level.value);
	const modulation = Number(pan.getAttribute('modulation') ?? 0);
	const position = Math.min(50, Math.max(-50, pan.value + modulation)) / 100 + 0.5;

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

function tick(time: number): void {
	const tempo = document.querySelector<SonicNumber>('[data-tempo]')?.value ?? 125;
	const beatMs = 60_000 / tempo;

	driveMeters(time, beatMs);
	for (const control of document.querySelectorAll<HTMLElement>('[data-lfo]')) {
		const rate = readSource(control.dataset.lfoRate, 0.5);
		const depth = readSource(control.dataset.lfoDepth, Number(control.dataset.lfo));
		const phase = (time / 1000) * rate * 2 * Math.PI;

		control.setAttribute('modulation', String(Math.round(depth * Math.sin(phase))));
	}
}

function bindRun(): void {
	const keys = [...document.querySelectorAll<SonicKey>('[data-run]')];
	let frame: number | undefined;

	const loop = (time: number): void => {
		tick(time);
		frame = requestAnimationFrame(loop);
	};
	const run = (isRunning: boolean): void => {
		for (const key of keys) key.pressed = isRunning;
		if (frame !== undefined) cancelAnimationFrame(frame);
		frame = isRunning ? requestAnimationFrame(loop) : undefined;
		if (isRunning) return;

		for (const control of document.querySelectorAll('[data-lfo]'))
			control.removeAttribute('modulation');
	};

	for (const key of keys) {
		key.addEventListener('change', () => {
			run(key.pressed);
		});
	}
	for (const stop of document.querySelectorAll('[data-stop]')) {
		stop.addEventListener('click', () => {
			run(false);
		});
	}
	run(!matchMedia('(prefers-reduced-motion: reduce)').matches);
}

bindRun();
