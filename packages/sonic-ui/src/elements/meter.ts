import { SonicElement } from '#elements/sonic-element.ts';
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

const releaseDecibelsPerSecond = 20;
const holdMs = 1500;

function toDecibels(amplitude: number): number {
	return 20 * Math.log10(Math.abs(amplitude));
}

// A `calc()` rather than a count, so the zone's token stays live
function lightsBelow(lights: Array<number>, zone: 'clip' | 'hot'): string {
	const terms = lights.map(
		(threshold) => `sign(max(0, var(--_sonic-meter-${zone}-from) - (${String(threshold)})))`,
	);

	return `calc(${terms.join(' + ')})`;
}

// On the default `db` scale, `level` is a linear amplitude shown in dBFS; on `linear`, it is in the units of `min` and `max`
export class SonicMeter extends SonicElement {
	static override readonly observedAttributes = [
		'disabled',
		'lights',
		'max',
		'min',
		'origin',
		'scale',
	];

	get level(): number {
		return this.#level;
	}

	set level(amplitude: number) {
		if (!Number.isFinite(amplitude)) return;

		const now = performance.now();

		this.#level = amplitude;
		if (this.scale === 'linear') {
			this.#render(now);
			return;
		}

		const decibels = toDecibels(amplitude);

		this.#target = decibels;
		this.#bar = Math.max(this.#bar, decibels);
		if (decibels >= this.#peak) {
			this.#peak = decibels;
			this.#peakAt = now;
		}
		if (decibels >= 0) this.#clipAt = now;
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

	// fallow-ignore-next-line code-duplication -- one accessor pair per reflected attribute, as on a native element
	get origin(): number | undefined {
		return this.optionalNumberAttribute('origin');
	}

	set origin(value: number | undefined) {
		this.reflect('origin', value);
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

	// Parsed once per attribute change rather than per frame
	#lights: Array<number> | undefined;

	readonly #meter = renderMeter();

	#peak = -Infinity;

	#peakAt = -Infinity;

	#target = -Infinity;

	attributeChangedCallback(): void {
		const now = performance.now();

		this.#renderLights();
		this.#render(now);
		this.#schedule(now);
	}

	protected connect(signal: AbortSignal): void {
		const now = performance.now();

		this.upgradeProperties('lights', 'max', 'min', 'orientation', 'origin', 'scale', 'level');
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

	#fraction(level: number): number {
		const lights = this.#lights;
		if (lights) return lights.filter((threshold) => threshold <= level).length / lights.length;

		return linearTaper(this.min, this.max).position(level);
	}

	#isSettled(now: number): boolean {
		if (this.scale === 'linear') return true;

		const floor = this.min;

		return (
			this.#bar <= Math.max(this.#target, floor) &&
			this.#peak <= Math.max(this.#bar, floor) &&
			now - this.#clipAt >= holdMs
		);
	}

	#render(now: number): void {
		const meter = this.#meter;

		const origin = this.origin === undefined ? 0 : this.#fraction(this.origin);

		meter.style.setProperty('--_sonic-meter-min', String(this.min));
		meter.style.setProperty('--_sonic-meter-max', String(this.max));
		meter.style.setProperty('--_sonic-meter-origin', String(origin));

		// Disabled puts the light out, as on the other controls; the ballistics keep running so it lights up mid-fall
		// The consumer smooths a linear level, so it has no fall, hold or clip
		if (this.disabled || this.scale === 'linear') {
			const level = this.disabled ? origin : this.#fraction(this.#level);

			meter.style.setProperty('--_sonic-meter-level', String(level));
			meter.style.setProperty('--_sonic-meter-peak', '0');
			meter.style.setProperty('--_sonic-meter-clipped', '0');
			return;
		}

		meter.style.setProperty('--_sonic-meter-level', String(this.#fraction(this.#bar)));
		meter.style.setProperty('--_sonic-meter-peak', String(this.#fraction(this.#peak)));
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

	#schedule(now: number): void {
		if (this.#frame !== undefined || !this.isConnected || this.#isSettled(now)) return;

		if (this.#lastFrame === undefined) this.#lastFrame = now;
		this.#frame = requestAnimationFrame(this.#tick);
	}

	// Timed by the frame rather than counted, so a 120Hz display falls at the same speed
	readonly #tick = (time: number): void => {
		const fall = (releaseDecibelsPerSecond * Math.max(0, time - (this.#lastFrame ?? time))) / 1000;

		this.#frame = undefined;
		this.#lastFrame = time;
		this.#bar = Math.max(this.#target, this.min, this.#bar - fall);
		if (time - this.#peakAt >= holdMs) this.#peak = Math.max(this.#bar, this.#peak - fall);
		this.#render(time);
		if (this.#isSettled(time)) {
			this.#lastFrame = undefined;
			return;
		}

		this.#frame = requestAnimationFrame(this.#tick);
	};
}
