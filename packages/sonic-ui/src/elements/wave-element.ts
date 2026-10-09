import type { ValueNotation } from '#elements/value-element.ts';
import type { Surface, SurfaceFrame } from '#lib/canvas-surface.ts';
import type { Point } from '#lib/marker-band.ts';
import type { Seconds } from '#lib/units.ts';

import { SonicValueElement } from '#elements/value-element.ts';
import { bindSurface } from '#lib/canvas-surface.ts';
import { formatClock, parseClock } from '#lib/clock.ts';
import { spokenDuration } from '#lib/spoken-duration.ts';

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

function markerKey(marker: undefined | WaveMarker): string {
	return marker ? [marker.start, marker.end, marker.kind, marker.label].join('|') : '';
}

export abstract class SonicWaveElement<
	Colour extends string,
	Length extends string = never,
	Numeric extends string = never,
> extends SonicValueElement {
	static override readonly observedAttributes = [...SonicValueElement.observedAttributes, 'fill'];

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

	protected abstract readonly canvas: HTMLCanvasElement;

	protected abstract readonly colours: Record<Colour, `--_sonic-${string}`>;

	protected abstract readonly control: HTMLElement;

	protected abstract readonly lengths: Record<Length, `--_sonic-${string}`>;

	protected override readonly notation: ValueNotation = {
		format: formatClock,
		parse: parseClock,
		speak: (seconds) => spokenDuration(seconds, this.closest<HTMLElement>('[lang]')?.lang),
	};

	protected abstract readonly numbers: Record<Numeric, `--_sonic-${string}`>;

	protected abstract readonly sheet: string;

	protected abstract readonly sizeProperty: `--_sonic-${string}`;

	#current: undefined | WaveMarker;

	#markers: Array<WaveMarker> = [];

	#surface: Surface | undefined;

	override attributeChangedCallback(name: string): void {
		super.attributeChangedCallback(name);
		if (name === 'fill') this.#surface?.setFill(this.fill);
	}

	abstract clientXOf(value: Seconds): number;

	override connectedCallback(): void {
		this.upgradeProperties('fill', 'markers');
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

		this.keepControl(control, signal);
		this.renderEmpty();
		this.#surface = bindSurface({
			canvas: this.canvas,
			colours: this.colours,
			fill: { control, sizeProperty: this.sizeProperty },
			lengths: this.lengths,
			numbers: this.numbers,
			paint: (context, frame) => {
				this.paint(context, frame);
			},
			resize: () => {
				this.renderMarkers();
			},
			signal,
		});
		this.render();
		if (__DEV__)
			this.checkStyles(control, this.sheet, {
				property: 'margin-bottom',
				selector: '[popover]',
			});
		this.#surface.setFill(this.fill);
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
}
