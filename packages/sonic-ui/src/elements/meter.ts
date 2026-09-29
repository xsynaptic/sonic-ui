import { SonicElement } from '#elements/sonic-element.ts';
import { template } from '#lib/render.ts';

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

// `level` is a linear amplitude; `min` and `max` are dBFS
export class SonicMeter extends SonicElement {
	static override readonly observedAttributes = ['disabled', 'max', 'min'];

	get level(): number {
		return this.#level;
	}

	set level(amplitude: number) {
		if (!Number.isFinite(amplitude)) return;

		const decibels = toDecibels(amplitude);
		const now = performance.now();

		this.#level = amplitude;
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

	#bar = -Infinity;

	#clipAt = -Infinity;

	#frame: number | undefined;

	#lastFrame: number | undefined;

	#level = 0;

	readonly #meter = renderMeter();

	#peak = -Infinity;

	#peakAt = -Infinity;

	#target = -Infinity;

	attributeChangedCallback(): void {
		const now = performance.now();

		this.#render(now);
		this.#schedule(now);
	}

	protected connect(signal: AbortSignal): void {
		const now = performance.now();

		this.upgradeProperties('max', 'min', 'orientation', 'level');
		this.appendOnce(this.#meter);
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

	#fraction(decibels: number): number {
		const min = this.min;
		const range = this.max - min;

		return range > 0 ? Math.min(1, Math.max(0, (decibels - min) / range)) : 0;
	}

	#isSettled(now: number): boolean {
		const floor = this.min;

		return (
			this.#bar <= Math.max(this.#target, floor) &&
			this.#peak <= Math.max(this.#bar, floor) &&
			now - this.#clipAt >= holdMs
		);
	}

	#render(now: number): void {
		const meter = this.#meter;

		meter.style.setProperty('--_sonic-meter-min', String(this.min));
		meter.style.setProperty('--_sonic-meter-max', String(this.max));

		// Disabled puts the light out, as on the other controls; the ballistics keep running so it lights up mid-fall
		if (this.disabled) {
			meter.style.setProperty('--_sonic-meter-level', '0');
			meter.style.setProperty('--_sonic-meter-peak', '0');
			meter.style.setProperty('--_sonic-meter-clipped', '0');
			return;
		}

		meter.style.setProperty('--_sonic-meter-level', String(this.#fraction(this.#bar)));
		meter.style.setProperty('--_sonic-meter-peak', String(this.#fraction(this.#peak)));
		meter.style.setProperty('--_sonic-meter-clipped', now - this.#clipAt < holdMs ? '1' : '0');
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
