import { SonicElement } from '#elements/sonic-element.ts';
import { ballisticsRates, fall, rise, stepNeedle } from '#lib/ballistics.ts';
import { parseNumberList } from '#lib/number-list.ts';
import { template } from '#lib/render.ts';
import { linearTaper } from '#lib/taper.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-meter': SonicMeter;
	}
}

const renderMeter = template(
	/* HTML */ `
		<div aria-hidden="true" class="sonic-meter">
			<div class="sonic-meter-segments"></div>
			<div class="sonic-meter-level"></div>
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
function lightsBelow(lights: Array<number>, zone: 'clip' | 'hot'): string {
	const terms = lights.map(
		(threshold) => `sign(max(0, var(--_sonic-meter-${zone}-from) - (${String(threshold)})))`,
	);

	return `calc(${terms.join(' + ')})`;
}

export class SonicMeter extends SonicElement {
	static override readonly observedAttributes = [
		'ballistics',
		'disabled',
		'lights',
		'max',
		'min',
		'origin',
		'scale',
	];

	get ballistics(): (typeof ballisticsModes)[number] {
		const name = this.getAttribute('ballistics');

		return ballisticsModes.find((mode) => mode === name) ?? 'peak';
	}

	set ballistics(mode: (typeof ballisticsModes)[number] | undefined) {
		this.reflect('ballistics', mode);
	}

	get level(): number {
		return this.#level;
	}

	set level(amplitude: number) {
		if (!Number.isFinite(amplitude)) return;

		const now = performance.now();

		this.#level = amplitude;
		if (this.scale === 'linear') {
			this.#peak = Math.max(this.#peak, amplitude);
			this.#render(now);
			return;
		}

		const decibels = toDecibels(amplitude);

		this.#peak = Math.max(this.#peak, decibels);
		this.#target = decibels;
		if (decibels >= 0) this.#clipAt = now;
		this.#step(now, 0);
		this.#render(now);
		this.#schedule(now);
	}

	get lights(): Array<number> | undefined {
		return parseNumberList(this.getAttribute('lights'));
	}

	set lights(thresholds: Array<number> | undefined) {
		this.reflect('lights', thresholds?.join(' '));
	}

	get max(): number {
		return this.numberAttribute('max', 0);
	}

	set max(decibels: number | undefined) {
		this.reflect('max', decibels);
	}

	get min(): number {
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

	get peak(): number {
		return this.#peak;
	}

	get scale(): 'db' | 'linear' {
		return this.getAttribute('scale') === 'linear' ? 'linear' : 'db';
	}

	set scale(scale: 'db' | 'linear' | undefined) {
		this.reflect('scale', scale);
	}

	#bar = -Infinity;

	#clipAt = -Infinity;

	#frame: number | undefined;

	#lastFrame: number | undefined;

	#level = 0;

	#lights: Array<number> | undefined;

	readonly #meter = renderMeter();

	#peak = -Infinity;

	#peakHold = -Infinity;

	#peakHoldAt = -Infinity;

	#target = -Infinity;

	#velocity = 0;

	attributeChangedCallback(name: string): void {
		const now = performance.now();

		if (name === 'ballistics') this.#velocity = 0;
		else if (name === 'scale') this.resetPeak();
		this.#renderLights();
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
			'lights',
			'max',
			'min',
			'orientation',
			'origin',
			'scale',
			'level',
		);
		this.appendOnce(this.#meter);
		this.#renderLights();
		this.#render(now);
		this.#schedule(now);
		this.checkStyles(this.#meter, 'meter.css');
		signal.addEventListener(
			'abort',
			() => {
				if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
				this.#frame = undefined;
				this.#lastFrame = undefined;
			},
			{ once: true },
		);
	}

	#isSettled(now: number): boolean {
		if (this.scale === 'linear') return true;
		if (now - this.#clipAt < holdMs) return false;
		if (this.ballistics === 'vu') return this.#bar === this.#target && this.#velocity === 0;

		const floor = this.min;

		return (
			this.#bar >= this.#target &&
			this.#bar <= Math.max(this.#target, floor) &&
			this.#peakHold <= Math.max(this.#bar, floor)
		);
	}

	#place(level: number): number {
		const lights = this.#lights;
		if (lights) return lights.filter((threshold) => threshold <= level).length / lights.length;

		return linearTaper(this.min, this.max).place(level);
	}

	#render(now: number): void {
		const meter = this.#meter;

		const origin = this.origin === undefined ? 0 : this.#place(this.origin);

		meter.style.setProperty('--_sonic-meter-min', String(this.min));
		meter.style.setProperty('--_sonic-meter-max', String(this.max));
		meter.style.setProperty('--_sonic-meter-origin', String(origin));

		if (this.disabled || this.scale === 'linear') {
			const level = this.disabled ? origin : this.#place(this.#level);

			meter.style.setProperty('--_sonic-meter-level', String(level));
			meter.style.setProperty('--_sonic-meter-peak-hold', '0');
			meter.style.setProperty('--_sonic-meter-clipped', '0');
			return;
		}

		const peakHold = this.ballistics === 'vu' ? 0 : this.#place(this.#peakHold);

		meter.style.setProperty('--_sonic-meter-level', String(this.#place(this.#bar)));
		meter.style.setProperty('--_sonic-meter-peak-hold', String(peakHold));
		meter.style.setProperty('--_sonic-meter-clipped', now - this.#clipAt < holdMs ? '1' : '0');
	}

	#renderLights(): void {
		const meter = this.#meter;
		const lights = this.lights;

		this.#lights = lights;
		this.toggleState('ladder', lights !== undefined);
		if (!lights) {
			for (const name of ['count', 'hot-lights', 'clip-lights']) {
				meter.style.removeProperty(`--_sonic-meter-${name}`);
			}
			return;
		}

		meter.style.setProperty('--_sonic-meter-count', String(lights.length));
		meter.style.setProperty('--_sonic-meter-hot-lights', lightsBelow(lights, 'hot'));
		meter.style.setProperty('--_sonic-meter-clip-lights', lightsBelow(lights, 'clip'));
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

		const { fallDecibelsPerSecond, riseMs } = ballisticsRates[mode];
		const floor = Math.max(this.#target, this.min);

		this.#bar =
			this.#target > this.#bar
				? this.#risen(riseMs, elapsedMs)
				: fall(this.#bar, { fallDecibelsPerSecond, floor }, elapsedMs);
		if (this.#bar >= this.#peakHold) {
			this.#peakHold = this.#bar;
			this.#peakHoldAt = now;
		}
		if (now - this.#peakHoldAt >= holdMs) {
			this.#peakHold = fall(this.#peakHold, { fallDecibelsPerSecond, floor: this.#bar }, elapsedMs);
		}
	}

	#stepNeedle(elapsedMs: number): void {
		const target = toAmplitude(this.#target);
		const needle = stepNeedle(
			{ position: toAmplitude(this.#bar), velocity: this.#velocity },
			target,
			elapsedMs,
		);
		const isLanded =
			Math.abs(needle.position - target) < settledAmplitude &&
			Math.abs(needle.velocity) < settledPerSecond;

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
