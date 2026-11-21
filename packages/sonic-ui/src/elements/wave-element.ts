import type { ValueNotation } from '#elements/value-element.ts';
import type { Surface, SurfaceFrame } from '#lib/canvas-surface.ts';
import type { BoxProbe } from '#lib/check-styles.ts';
import type { Point } from '#lib/marker-band.ts';
import type { Oklch, Rgb } from '#lib/oklch.ts';
import type { Seconds } from '#lib/units.ts';
import type { TintCell, TintDynamics, TintHue } from '#lib/wave-tint.ts';

import { SonicValueElement } from '#elements/value-element.ts';
import { bindControlSurface } from '#lib/canvas-surface.ts';
import { formatClock, parseClock } from '#lib/clock.ts';
import { oklchOf } from '#lib/oklch.ts';
import { spokenDuration } from '#lib/spoken-duration.ts';
import { parseTintDynamics, parseTintHue, tintCellOf } from '#lib/wave-tint.ts';

declare const __DEV__: boolean;

declare global {
	interface HTMLElementEventMap {
		'sonic-marker': Event;
	}
}

export interface WaveMarker {
	// Open to a consumer's own keys, which `renderLabel` draws from
	[key: string]: unknown;
	dimmed?: boolean;
	/** Makes the marker a region */
	end?: Seconds;
	/** Lowercase letters, digits and hyphens; colours the marker through `--sonic-marker-<kind>` */
	kind?: string;
	label?: string;
	start: Seconds;
}

export interface ProbedPalette {
	stops: Array<Oklch>;
	surfaceLightness: number;
}

const maxTintStops = 5;

function probeOf(colour: string): HTMLDivElement {
	const probe = document.createElement('div');

	probe.style.setProperty('color', colour);

	return probe;
}

// Painting a pixel is the only reliable way to turn any CSS colour syntax into channels
export function paintedChannels(
	strip: CanvasRenderingContext2D,
	...colours: Array<string>
): Rgb | undefined {
	strip.clearRect(0, 0, 1, 1);
	for (const colour of colours) {
		strip.fillStyle = colour;
		strip.fillRect(0, 0, 1, 1);
	}

	const [red = 0, green = 0, blue = 0, alpha = 0] = strip.getImageData(0, 0, 1, 1).data;

	return alpha === 0 ? undefined : [red, green, blue];
}

function markerKey(marker: undefined | WaveMarker): string {
	return marker ? [marker.start, marker.end, marker.kind, marker.label].join('|') : '';
}

export abstract class SonicWaveElement<
	Colour extends string,
	Length extends string = never,
	Numeric extends string = never,
> extends SonicValueElement {
	static override readonly observedAttributes = [
		...SonicValueElement.observedAttributes,
		'fill',
		'tint-dynamics',
		'tint-hue',
	];

	get currentMarker(): undefined | WaveMarker {
		return this.#current ? { ...this.#current } : undefined;
	}

	get fill(): boolean {
		return this.hasAttribute('fill');
	}

	set fill(isFilling: boolean) {
		this.reflect('fill', isFilling);
	}

	get markers(): Array<WaveMarker> {
		return this.#markers.map((marker) => ({ ...marker }));
	}

	set markers(list: Iterable<WaveMarker> | undefined) {
		this.#markers = [...(list ?? [])]
			.filter((marker) => Number.isFinite(marker.start))
			.map((marker) => ({ ...marker }))
			.toSorted((first, second) => first.start - second.start);
		if (!this.isBound()) return;

		this.renderMarkers();
		this.render();
	}

	get tintDynamics(): TintDynamics | undefined {
		return parseTintDynamics(this.getAttribute('tint-dynamics'));
	}

	set tintDynamics(dynamics: TintDynamics | undefined) {
		this.reflect('tint-dynamics', dynamics);
	}

	get tintHue(): TintHue | undefined {
		return parseTintHue(this.getAttribute('tint-hue'));
	}

	set tintHue(hue: TintHue | undefined) {
		this.reflect('tint-hue', hue);
	}

	protected override readonly boxProbe: BoxProbe = {
		property: 'margin-bottom',
		selector: '[popover]',
	};

	protected abstract readonly canvas: HTMLCanvasElement;

	protected abstract readonly colours: Record<Colour, `--_sonic-${string}`>;

	protected abstract readonly lengths: Record<Length, `--_sonic-${string}`>;

	protected override readonly notation: ValueNotation = {
		format: formatClock,
		parse: parseClock,
		speak: (seconds) => spokenDuration(seconds, this.closest<HTMLElement>('[lang]')?.lang),
	};

	protected abstract readonly numbers: Record<Numeric, `--_sonic-${string}`>;

	protected abstract override readonly sheet: string;

	protected abstract readonly sizeProperty: `--_sonic-${string}`;

	#current: undefined | WaveMarker;

	#markers: Array<WaveMarker> = [];

	#surface: Surface | undefined;

	#tintCanvas: CanvasRenderingContext2D | undefined;

	readonly #warned = new WeakSet<object>();

	override attributeChangedCallback(name: string): void {
		super.attributeChangedCallback(name);
		if (name === 'fill') this.#surface?.setFill(this.fill);
		else if (name === 'tint-hue' || name === 'tint-dynamics') this.#surface?.rebuild();
	}

	abstract clientXOf(value: Seconds): number;

	override connectedCallback(): void {
		this.upgradeProperties('fill', 'markers', 'tintDynamics', 'tintHue');
		super.connectedCallback();
	}

	/** Copies; none outside the canvas */
	markersFromPoint(clientX: number, clientY: number): Array<WaveMarker> {
		const box = this.canvas.getBoundingClientRect();
		const isInside =
			clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom;
		if (!isInside) return [];

		return this.markersInReach({ x: clientX - box.left, y: clientY - box.top }, box.width).flatMap(
			(index) => {
				const marker = this.#markers[index];

				return marker ? [{ ...marker }] : [];
			},
		);
	}

	repaint(): void {
		this.#surface?.rebuild();
	}

	/** The time at a viewport x, clamped to the bounds and not snapped to the step */
	abstract valueFromPoint(clientX: number, clientY: number): Seconds;

	protected connect(signal: AbortSignal): void {
		const control = this.control;

		this.keepControl(signal);
		this.renderEmpty();
		this.#surface = bindControlSurface({
			canvas: this.canvas,
			colours: this.colours,
			control,
			fill: this.fill,
			lengths: this.lengths,
			numbers: this.numbers,
			paint: (context, frame) => {
				this.paint(context, frame);
			},
			resize: () => {
				this.renderMarkers();
			},
			signal,
			sizeProperty: this.sizeProperty,
		});
		this.render();
	}

	protected abstract isEmpty(): boolean;

	protected markerList(): ReadonlyArray<WaveMarker> {
		return this.#markers;
	}

	protected markerProportions(): Array<[number, number]> {
		const mapping = this.mapping();

		return this.#markers.map(({ end, start }) => {
			const at = mapping.proportionOf(start);
			const to = end === undefined ? at : mapping.proportionOf(end);

			return [Math.min(at, to), Math.max(at, to)];
		});
	}

	protected abstract markersInReach(point: Point, widthPx: number): Array<number>;

	protected abstract paint(
		context: CanvasRenderingContext2D,
		frame: SurfaceFrame<Colour, Length, Numeric>,
	): void;

	protected override proportionsChanged(): void {
		this.renderMarkers();
	}

	protected readProbes(probes: Array<HTMLElement>): Array<string> {
		this.control.append(...probes);

		const read = probes.map((probe) => getComputedStyle(probe).color);

		for (const probe of probes) probe.remove();

		return read;
	}

	protected readTintPalette(strip: CanvasRenderingContext2D, control: string): ProbedPalette {
		strip.canvas.height = 1;

		const probes = [
			...Array.from({ length: maxTintStops }, (_stop, index) =>
				probeOf(`var(--sonic-${control}-tint-${String(index + 1)}, transparent)`),
			),
			probeOf('var(--_sonic-unlit-solid)'),
		];
		const read = this.readProbes(probes).map((colour) => paintedChannels(strip, colour));
		const surface = read.pop();

		return {
			stops: read.flatMap((channels) => (channels ? [oklchOf(channels)] : [])),
			surfaceLightness: surface ? oklchOf(surface).lightness : 0,
		};
	}

	/** Returns no canvas until the tint has its data, and warns once for each data object whose reference is missing */
	protected readyTintCanvas<Missing extends string>(
		readiness: { isReady: false; missing: Missing | undefined } | { isReady: true },
		sourceOf: Record<Missing, object | undefined>,
	): CanvasRenderingContext2D | undefined {
		if (readiness.isReady) return this.tintCanvas();
		if (readiness.missing) this.#warnTint(readiness.missing, sourceOf[readiness.missing]);

		return undefined;
	}

	protected renderEmpty(): void {
		this.toggleState('empty', this.isEmpty());
	}

	protected abstract renderMarkers(): void;

	protected override scrubChanged(): void {
		this.render();
	}

	protected showCurrentMarker(seconds: number): void {
		const current = this.#markers.findLast((marker) => marker.start <= seconds);
		if (markerKey(current) === markerKey(this.#current)) return;

		this.#current = current;
		this.dispatchEvent(new Event('sonic-marker', { bubbles: true }));
	}

	protected surface(): Surface | undefined {
		return this.#surface;
	}

	protected tintCanvas(): CanvasRenderingContext2D | undefined {
		if (!this.#tintCanvas) {
			this.#tintCanvas =
				document.createElement('canvas').getContext('2d', { willReadFrequently: true }) ??
				undefined;
		}

		return this.#tintCanvas;
	}

	protected tintCell(): TintCell | undefined {
		return tintCellOf(this.tintHue, this.tintDynamics);
	}

	#warnTint(missing: string, source: object | undefined): void {
		if (!__DEV__ || !source) return;
		if (this.#warned.has(source)) return;

		this.#warned.add(source);
		console.warn(`<${this.localName}> draws untinted until \`${missing}\` is set`);
	}
}
