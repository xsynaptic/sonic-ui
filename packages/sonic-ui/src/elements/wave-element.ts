import type { Surface, SurfaceFrame } from '#lib/canvas-surface.ts';

import { SonicValueElement } from '#elements/value-element.ts';
import { bindSurface } from '#lib/canvas-surface.ts';

export interface WaveMarker {
	dimmed?: boolean;
	end?: number;
	kind?: string;
	label?: string;
	start: number;
}

function markerKey(marker: undefined | WaveMarker): string {
	return marker ? [marker.start, marker.end, marker.kind, marker.label].join('|') : '';
}

export abstract class SonicWaveElement<
	Colour extends string,
	Length extends string = never,
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

	protected abstract readonly sheet: string;

	protected abstract readonly sizeProperty: `--_sonic-${string}`;

	#current: undefined | WaveMarker;

	#fillWatch: ResizeObserver | undefined;

	#markers: Array<WaveMarker> = [];

	#surface: Surface | undefined;

	override attributeChangedCallback(name: string): void {
		super.attributeChangedCallback(name);
		if (name === 'fill') this.#watchFill();
	}

	override connectedCallback(): void {
		this.upgradeProperties('fill', 'markers');
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
		this.#watchFill();
		signal.addEventListener(
			'abort',
			() => {
				this.#fillWatch?.disconnect();
				this.#fillWatch = undefined;
			},
			{ once: true },
		);
	}

	protected override focusTarget(): HTMLElement {
		return this.control;
	}

	protected override heldWrite(next: number): void {
		super.heldWrite(next);
		this.render();
	}

	protected override holdChanged(): void {
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

	protected override proportionsChanged(): void {
		this.renderMarkers();
	}

	protected renderEmpty(): void {
		this.toggleState('empty', this.isEmpty());
	}

	protected abstract renderMarkers(): void;

	protected showCurrentMarker(seconds: number): void {
		const current = this.#markers.findLast((marker) => marker.start <= seconds);
		if (markerKey(current) === markerKey(this.#current)) return;

		this.#current = current;
		this.dispatchEvent(new Event('sonic-marker', { bubbles: true }));
	}

	protected surface(): Surface | undefined {
		return this.#surface;
	}

	#watchFill(): void {
		const control = this.control;
		const isFilling = this.fill && this.isBound();
		if (isFilling === (this.#fillWatch !== undefined)) return;

		this.#fillWatch?.disconnect();
		this.#fillWatch = undefined;
		if (!isFilling) {
			control.style.removeProperty(this.sizeProperty);
			return;
		}

		this.#fillWatch = new ResizeObserver((entries) => {
			const box = entries.at(-1)?.borderBoxSize[0];
			if (!box) return;

			// Written a frame on, or the canvas resizes inside this delivery and WebKit reports a loop
			requestAnimationFrame(() => {
				if (this.#fillWatch) {
					control.style.setProperty(this.sizeProperty, `${String(box.blockSize)}px`);
				}
			});
		});
		this.#fillWatch.observe(control);
	}
}
