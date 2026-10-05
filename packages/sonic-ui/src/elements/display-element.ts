import type { Surface, SurfaceFrame } from '#lib/canvas-surface.ts';

import { SonicElement } from '#elements/sonic-element.ts';
import { bindSurface } from '#lib/canvas-surface.ts';
import { bindFill } from '#lib/fill-watch.ts';

export abstract class SonicDisplayElement<
	Colour extends string,
	Numeric extends string = never,
> extends SonicElement {
	static override readonly observedAttributes = [
		...SonicElement.observedAttributes,
		'fill',
		'max',
		'min',
	];

	get analyser(): AnalyserNode | undefined {
		return this.#analyser;
	}

	set analyser(node: AnalyserNode | null | undefined) {
		this.#analyser = node ?? undefined;
		this.#surface?.requestFrame();
	}

	// fallow-ignore-next-line code-duplication -- one accessor pair per reflected attribute
	get fill(): boolean {
		return this.hasAttribute('fill');
	}

	set fill(isFilling: boolean) {
		this.reflect('fill', isFilling);
	}

	// fallow-ignore-next-line code-duplication -- one accessor pair per reflected attribute
	get max(): number {
		return this.numberAttribute('max', 0);
	}

	set max(decibels: number | undefined) {
		this.reflect('max', decibels);
	}

	get min(): number {
		return this.numberAttribute('min', -90);
	}

	set min(decibels: number | undefined) {
		this.reflect('min', decibels);
	}

	protected abstract readonly canvas: HTMLCanvasElement;

	protected abstract readonly colours: Record<Colour, `--_sonic-${string}`>;

	protected abstract readonly control: HTMLElement;

	protected abstract readonly numbers: Record<Numeric, `--_sonic-${string}`>;

	protected abstract readonly sheet: string;

	protected abstract readonly sizeProperty: `--_sonic-${string}`;

	#analyser: AnalyserNode | undefined;

	#buffer = new Float32Array(0);

	#surface: Surface | undefined;

	#syncFill: ((isFilling: boolean) => void) | undefined;

	attributeChangedCallback(name: string): void {
		if (name === 'fill') this.#syncFill?.(this.fill);
		this.#surface?.invalidate();
	}

	override connectedCallback(): void {
		this.upgradeProperties('analyser', 'fill', 'max', 'min');
		super.connectedCallback();
	}

	push(frame: Float32Array): void {
		this.receive(frame);
		this.#surface?.requestFrame();
	}

	// fallow-ignore-next-line code-duplication -- the wave controls keep their own copy of the surface binding
	repaint(): void {
		this.#surface?.rebuild();
	}

	protected connect(signal: AbortSignal): void {
		const control = this.control;

		this.keepControl(control, signal);
		this.#surface = bindSurface({
			canvas: this.canvas,
			colours: this.colours,
			numbers: this.numbers,
			paint: (context, frame) => {
				this.#paint(context, frame);
			},
			signal,
		});
		this.checkStyles(control, this.sheet);
		this.#syncFill = bindFill(control, this.sizeProperty, signal);
		this.#syncFill(this.fill);
	}

	protected abstract paint(
		context: CanvasRenderingContext2D,
		frame: SurfaceFrame<Colour, never, Numeric>,
	): void;

	protected abstract pull(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): void;

	protected abstract receive(frame: Float32Array): void;

	protected surface(): Surface | undefined {
		return this.#surface;
	}

	// The node never signals that sound came back, so every paint pulls
	#paint(context: CanvasRenderingContext2D, frame: SurfaceFrame<Colour, never, Numeric>): void {
		const analyser = this.isDisabled() ? undefined : this.#analyser;

		if (analyser) {
			if (this.#buffer.length !== analyser.frequencyBinCount) {
				this.#buffer = new Float32Array(analyser.frequencyBinCount);
			}
			this.pull(analyser, this.#buffer);
			this.receive(this.#buffer);
		}
		this.paint(context, frame);
		if (analyser) this.#surface?.requestFrame();
	}
}
