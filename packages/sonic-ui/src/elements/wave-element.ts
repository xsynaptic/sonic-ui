import type { Surface, SurfaceFrame } from '#lib/canvas-surface.ts';

import { SonicValueElement } from '#elements/value-element.ts';
import { bindSurface } from '#lib/canvas-surface.ts';

interface WaveMarker {
	dimmed?: boolean;
	end?: number;
	kind?: string;
	label?: string;
	start: number;
}

export abstract class SonicWaveElement<
	Colour extends string,
	Length extends string = never,
> extends SonicValueElement {
	get markers(): Array<WaveMarker> {
		return this.#markers.map((marker) => ({ ...marker }));
	}

	set markers(list: Iterable<WaveMarker> | undefined) {
		this.#markers = [...(list ?? [])]
			.filter((marker) => Number.isFinite(marker.start))
			.map((marker) => ({ ...marker }))
			.toSorted((first, second) => first.start - second.start);
		if (this.isBound()) this.renderMarkers();
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

		this.keepControl(control, signal);
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

	protected abstract paint(
		context: CanvasRenderingContext2D,
		frame: SurfaceFrame<Colour, Length>,
	): void;

	protected playback(): number {
		const from = this.heldFrom();

		return from === undefined ? this.value : (this.#heldAt ?? from);
	}

	protected override proportionsChanged(): void {
		this.renderMarkers();
	}

	protected renderEmpty(): void {
		this.toggleState('empty', this.isEmpty());
	}

	protected abstract renderMarkers(): void;

	protected surface(): Surface | undefined {
		return this.#surface;
	}
}
