import type { Surface, SurfaceFrame } from '#lib/canvas-surface.ts';

import { SonicRangeElement } from '#elements/range-element.ts';
import { bindSurface } from '#lib/canvas-surface.ts';

interface WaveMarker {
	dimmed?: boolean;
	end?: number;
	kind?: string;
	label?: string;
	value: number;
}

export abstract class SonicWaveElement<
	Colour extends string,
	Length extends string = never,
> extends SonicRangeElement {
	get markers(): Array<WaveMarker> {
		return this.#markers.map((marker) => ({ ...marker }));
	}

	set markers(list: Iterable<WaveMarker> | undefined) {
		this.#markers = [...(list ?? [])]
			.filter((marker) => Number.isFinite(marker.value))
			.map((marker) => ({ ...marker }))
			.toSorted((first, second) => first.value - second.value);
		this.renderMarkers();
	}

	protected abstract readonly canvas: HTMLCanvasElement;

	protected abstract readonly colours: Record<Colour, `--_sonic-${string}`>;

	protected abstract readonly control: HTMLElement;

	protected abstract readonly lengths: Record<Length, `--_sonic-${string}`>;

	protected abstract readonly sheet: string;

	#heldAt: number | undefined;

	#markers: Array<WaveMarker> = [];

	#surface: Surface | undefined;

	override connectedCallback(): void {
		this.upgradeProperties('markers');
		super.connectedCallback();
	}

	repaint(): void {
		this.#surface?.rebuild();
	}

	protected connect(signal: AbortSignal): void {
		const control = this.control;

		this.appendOnce(control);
		this.renderEmpty();
		this.#surface = bindSurface({
			canvas: this.canvas,
			colours: this.colours,
			lengths: this.lengths,
			paint: (context, frame) => {
				this.paint(context, frame);
			},
			resize: () => {
				this.renderMarkers();
			},
			signal,
		});
		this.render();
		this.checkStyles(control, this.sheet);
	}

	protected override focusTarget(): HTMLElement {
		return this.control;
	}

	protected override heldWrite(next: number): void {
		this.#heldAt = next;
		this.render();
	}

	protected override holdChanged(): void {
		if (this.heldFrom() === undefined) this.#heldAt = undefined;
		this.render();
	}

	protected abstract isEmpty(): boolean;

	protected markerPlaces(): Array<[number, number]> {
		const scale = this.scale();

		return this.#markers.map(({ end, value }) => {
			const at = scale.place(value);
			const to = end === undefined ? at : scale.place(end);

			return [Math.min(at, to), Math.max(at, to)];
		});
	}

	protected abstract paint(
		context: CanvasRenderingContext2D,
		frame: SurfaceFrame<Colour, Length>,
	): void;

	protected override placesChanged(): void {
		this.renderMarkers();
	}

	protected playback(): number {
		const from = this.heldFrom();

		return from === undefined ? this.value : (this.#heldAt ?? from);
	}

	protected renderEmpty(): void {
		this.toggleState('empty', this.isEmpty());
	}

	protected abstract renderMarkers(): void;

	protected surface(): Surface | undefined {
		return this.#surface;
	}
}
