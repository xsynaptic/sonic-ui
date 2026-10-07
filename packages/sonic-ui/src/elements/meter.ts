import type { Decibels } from '#lib/units.ts';

import { SonicElement } from '#elements/sonic-element.ts';
import { ballisticsRates, fall, rise, stepNeedle } from '#lib/ballistics.ts';
import { toNumber } from '#lib/math.ts';
import { parseNumberList } from '#lib/number-list.ts';
import { template } from '#lib/render.ts';
import { linearTaper } from '#lib/taper.ts';

declare const __DEV__: boolean;

declare global {
	interface HTMLElementTagNameMap {
		'sonic-meter': SonicMeter;
	}
}

const renderMeter = template(
	/* HTML */ `
		<div aria-hidden="true" class="sonic-meter">
			<div class="sonic-meter-segments"></div>
			<div class="sonic-meter-bar"></div>
			<div class="sonic-meter-clip"></div>
		</div>
	`,
	HTMLDivElement,
);

const holdMs = 1500;

const ballisticsModes = ['peak', 'ppm-1', 'ppm-2', 'vu'] as const;

const settledDecibels = 0.01;
const settledAmplitude = 1e-4;
const settledPerSecond = 1e-2;

function toDecibels(amplitude: number): number {
	return 20 * Math.log10(Math.abs(amplitude));
}

function toAmplitude(decibels: number): number {
	return 10 ** (decibels / 20);
}

// A `calc()` rather than a count, so the zone's token stays live
function segmentsBelow(segments: Array<number>, zone: 'clip' | 'hot'): string {
	const terms = segments.map(
		(threshold) => `sign(max(0, var(--_sonic-meter-${zone}-from) - (${String(threshold)})))`,
	);

	return `calc(${terms.join(' + ')})`;
}

export class SonicMeter extends SonicElement {
	static override readonly observedAttributes = [
		'ballistics',
		'disabled',
		'max',
		'min',
		'origin',
		'segments',
		'value',
	];

	get ballistics(): (typeof ballisticsModes)[number] {
		const name = this.getAttribute('ballistics');

		return ballisticsModes.find((mode) => mode === name) ?? 'peak';
	}

	set ballistics(mode: (typeof ballisticsModes)[number] | undefined) {
		this.reflect('ballistics', mode);
	}

	/** Linear peak amplitude, 1 at full scale; the meter converts to decibels and applies its ballistics */
	get level(): number {
		return this.#level;
	}

	set level(level: number) {
		const amplitude = toNumber(level);
		if (!Number.isFinite(amplitude)) return;

		const decibels = toDecibels(amplitude);

		this.#level = amplitude;
		this.#target = decibels;
		if (this.#isValueShown) return;

		const now = performance.now();

		this.#peak = Math.max(this.#peak, decibels);
		if (decibels >= 0) this.#clipAt = now;
		this.#step(now, 0);
		this.#render(now);
		this.#schedule(now);
	}

	get max(): Decibels {
		return this.numberAttribute('max', 0);
	}

	set max(decibels: number | undefined) {
		this.reflect('max', decibels);
	}

	get min(): Decibels {
		return this.numberAttribute('min', -60);
	}

	set min(decibels: number | undefined) {
		this.reflect('min', decibels);
	}

	get orientation(): 'horizontal' | 'vertical' {
		return this.getAttribute('orientation') === 'horizontal' ? 'horizontal' : 'vertical';
	}

	set orientation(direction: 'horizontal' | 'vertical' | undefined) {
		this.reflect('orientation', direction);
	}

	// fallow-ignore-next-line code-duplication -- one accessor pair per reflected attribute
	get origin(): number | undefined {
		return this.optionalNumberAttribute('origin');
	}

	set origin(value: number | undefined) {
		this.reflect('origin', value);
	}

	/** Highest level since `resetPeak()`; `-Infinity` before any signal */
	get peak(): Decibels {
		return this.#peak;
	}

	/** Ladder thresholds, one per segment; unset draws a bar */
	get segments(): Array<Decibels> | undefined {
		return parseNumberList(this.getAttribute('segments'));
	}

	set segments(thresholds: Array<Decibels> | undefined) {
		this.reflect('segments', thresholds?.join(' '));
	}

	/** A reading in the meter's own units, drawn as given with no ballistics; takes over from `level` while set */
	get value(): number | undefined {
		return this.optionalNumberAttribute('value');
	}

	set value(value: number | undefined) {
		this.reflect('value', value);
	}

	#bar = -Infinity;

	#carryMs = 0;

	#clipAt = -Infinity;

	#frame: number | undefined;

	#isValueShown = false;

	#lastFrame: number | undefined;

	#level = 0;

	readonly #meter = renderMeter();

	#peak = -Infinity;

	#peakHold = -Infinity;

	#peakHoldAt = -Infinity;

	#segments: Array<number> | undefined;

	#target = -Infinity;

	#velocity = 0;

	attributeChangedCallback(name: string): void {
		const now = performance.now();

		if (name === 'ballistics') this.#velocity = 0;
		else if (name === 'value') this.#readValue(now);
		this.#segments = this.segments;
		if (name === 'segments') this.#renderSegments();
		this.#render(now);
		this.#schedule(now);
	}

	resetPeak(): void {
		this.#peak = -Infinity;
	}

	protected connect(signal: AbortSignal): void {
		const now = performance.now();

		this.upgradeProperties(
			'ballistics',
			'max',
			'min',
			'orientation',
			'origin',
			'segments',
			'value',
			'level',
		);
		this.keepControl(this.#meter, signal);
		this.#renderSegments();
		this.#render(now);
		this.#schedule(now);
		signal.addEventListener(
			'abort',
			() => {
				if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
				this.#frame = undefined;
				this.#lastFrame = undefined;
			},
			{ once: true },
		);
		if (__DEV__) this.checkStyles(this.#meter, 'meter.css');
	}

	#isSettled(now: number): boolean {
		if (this.#isValueShown) return true;
		if (now - this.#clipAt < holdMs) return false;
		if (this.ballistics === 'vu') return this.#bar === this.#target && this.#velocity === 0;

		const floor = this.min;

		return (
			this.#bar >= this.#target &&
			this.#bar <= Math.max(this.#target, floor) &&
			this.#peakHold <= Math.max(this.#bar, floor)
		);
	}

	#proportionOf(level: number): number {
		const segments = this.#segments;
		if (segments) {
			return segments.filter((threshold) => threshold <= level).length / segments.length;
		}

		return linearTaper(this.min, this.max).proportionOf(level);
	}

	#readValue(now: number): void {
		const value = this.value;
		const isValueShown = value !== undefined;

		if (isValueShown !== this.#isValueShown) {
			this.#isValueShown = isValueShown;
			this.resetPeak();
			if (!isValueShown) this.#step(now, 0);
		}
		if (value !== undefined) this.#peak = Math.max(this.#peak, value);
	}

	#render(now: number): void {
		if (!this.isBound()) return;

		const meter = this.#meter;

		const origin = this.origin === undefined ? 0 : this.#proportionOf(this.origin);

		meter.style.setProperty('--_sonic-meter-min', String(this.min));
		meter.style.setProperty('--_sonic-meter-max', String(this.max));
		meter.style.setProperty('--_sonic-meter-origin', String(origin));

		if (this.disabled) {
			this.#renderStill(origin);
			return;
		}

		const value = this.value;

		if (value !== undefined) {
			this.#renderStill(this.#proportionOf(value));
			return;
		}

		const peakHold = this.ballistics === 'vu' ? 0 : this.#proportionOf(this.#peakHold);

		meter.style.setProperty('--_sonic-meter-bar', String(this.#proportionOf(this.#bar)));
		meter.style.setProperty('--_sonic-meter-peak-hold', String(peakHold));
		meter.style.setProperty('--_sonic-meter-clipped', now - this.#clipAt < holdMs ? '1' : '0');
	}

	#renderSegments(): void {
		if (!this.isBound()) return;

		const meter = this.#meter;
		const segments = this.#segments;

		this.toggleState('ladder', segments !== undefined);
		if (!segments) {
			for (const name of ['count', 'hot-segments', 'clip-segments']) {
				meter.style.removeProperty(`--_sonic-meter-${name}`);
			}
			return;
		}

		meter.style.setProperty('--_sonic-meter-count', String(segments.length));
		meter.style.setProperty('--_sonic-meter-hot-segments', segmentsBelow(segments, 'hot'));
		meter.style.setProperty('--_sonic-meter-clip-segments', segmentsBelow(segments, 'clip'));
	}

	#renderStill(bar: number): void {
		const { style } = this.#meter;

		style.setProperty('--_sonic-meter-bar', String(bar));
		style.setProperty('--_sonic-meter-peak-hold', '0');
		style.setProperty('--_sonic-meter-clipped', '0');
	}

	#risen(timeConstantMs: number, elapsedMs: number): number {
		const target = toAmplitude(this.#target);
		const risen = toDecibels(rise(toAmplitude(this.#bar), { target, timeConstantMs }, elapsedMs));

		return this.#target - risen < settledDecibels ? this.#target : risen;
	}

	#schedule(now: number): void {
		if (this.#frame !== undefined || !this.isConnected || this.#isSettled(now)) return;

		if (this.#lastFrame === undefined) this.#lastFrame = now;
		this.#frame = requestAnimationFrame(this.#tick);
	}

	#step(now: number, elapsedMs: number): void {
		const mode = this.ballistics;

		if (mode === 'vu') {
			this.#stepNeedle(elapsedMs);
			return;
		}

		const { fallDecibelsPerSecond, riseTimeConstantMs } = ballisticsRates[mode];
		const floor = Math.max(this.#target, this.min);

		this.#bar =
			this.#target > this.#bar
				? this.#risen(riseTimeConstantMs, elapsedMs)
				: fall(this.#bar, { fallDecibelsPerSecond, floor }, elapsedMs);
		if (this.#bar >= this.#peakHold) {
			this.#peakHold = this.#bar;
			this.#peakHoldAt = now;
		}

		const pastHoldMs = now - this.#peakHoldAt - holdMs;

		if (pastHoldMs >= 0) {
			this.#peakHold = fall(
				this.#peakHold,
				{ fallDecibelsPerSecond, floor: this.#bar },
				Math.min(elapsedMs, pastHoldMs),
			);
		}
	}

	#stepNeedle(elapsedMs: number): void {
		const target = toAmplitude(this.#target);
		const needle = stepNeedle(
			{ carryMs: this.#carryMs, position: toAmplitude(this.#bar), velocity: this.#velocity },
			target,
			elapsedMs,
		);
		const isLanded =
			Math.abs(needle.position - target) < settledAmplitude &&
			Math.abs(needle.velocity) < settledPerSecond;

		this.#carryMs = needle.carryMs;
		this.#velocity = isLanded ? 0 : needle.velocity;
		this.#bar = isLanded ? this.#target : toDecibels(Math.max(0, needle.position));
	}

	readonly #tick = (time: number): void => {
		const elapsedMs = Math.max(0, time - (this.#lastFrame ?? time));

		this.#frame = undefined;
		this.#lastFrame = time;
		this.#step(time, elapsedMs);
		this.#render(time);
		if (this.#isSettled(time)) {
			this.#lastFrame = undefined;
			return;
		}

		this.#frame = requestAnimationFrame(this.#tick);
	};
}
