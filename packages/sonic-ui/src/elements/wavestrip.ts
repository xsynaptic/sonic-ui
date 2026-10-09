import type { ValueAxis } from '#elements/value-gestures.ts';
import type { WaveMarker } from '#elements/wave-element.ts';
import type { SurfaceFrame } from '#lib/canvas-surface.ts';
import type { Point } from '#lib/marker-band.ts';
import type { StripRegions } from '#lib/strip-scene.ts';
import type { TimeRegions } from '#lib/time-regions.ts';
import type { Seconds } from '#lib/units.ts';

import { RegionLayer } from '#elements/region-layer.ts';
import { SonicWaveElement } from '#elements/wave-element.ts';
import { createMarkerBand } from '#lib/marker-band.ts';
import { clamp, clampProportion } from '#lib/math.ts';
import { readPxProperty } from '#lib/read-px-property.ts';
import { requireChild, template } from '#lib/render.ts';
import { scrubRegions } from '#lib/scrub.ts';
import { stripBars, stripGroove, stripRegions } from '#lib/strip-scene.ts';
import { sortedRegions } from '#lib/time-regions.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-wavestrip': SonicWavestrip;
	}
}

type Colour = keyof typeof colours;

type Length = keyof typeof lengths;

export type MarkerRender = (marker: WaveMarker, element: HTMLElement) => void;

const colours = {
	buffered: '--_sonic-wavestrip-buffered',
	played: '--_sonic-wavestrip-played',
	scrub: '--_sonic-wavestrip-scrub',
	wave: '--_sonic-wavestrip-wave',
} as const;

const lengths = {
	gapRatio: '--_sonic-wavestrip-bar-gap-ratio',
	grooveRatio: '--_sonic-wavestrip-groove-ratio',
	grooveSize: '--_sonic-wavestrip-groove-size',
	pitch: '--_sonic-wavestrip-bar-pitch',
	radiusRatio: '--_sonic-wavestrip-bar-radius-ratio',
} as const;

const cancelZonePx = 48;

const renderWavestrip = template(
	/* HTML */ `
		<div class="sonic-wavestrip">
			<canvas class="sonic-wavestrip-canvas" role="slider" tabindex="0"></canvas>
			<div class="sonic-wavestrip-markers" aria-hidden="true"></div>
			<div class="sonic-wavestrip-regions"></div>
			<div class="sonic-wavestrip-readout" popover="manual">
				<span></span>
				<input
					autocomplete="off"
					class="sonic-wavestrip-entry"
					enterkeyhint="done"
					hidden
					spellcheck="false"
					type="text"
				/>
			</div>
		</div>
	`,
	HTMLDivElement,
);

function fillRegion(
	context: CanvasRenderingContext2D,
	path: Path2D,
	[from, to, style]: [number, number, string],
): void {
	context.save();
	context.beginPath();
	context.rect(from, 0, to - from, context.canvas.height);
	context.clip();
	context.fillStyle = style;
	context.fill(path);
	context.restore();
}

export class SonicWavestrip extends SonicWaveElement<Colour, Length> {
	/** Loaded spans, in seconds */
	// fallow-ignore-next-line code-duplication -- one accessor pair per property
	get buffered(): Array<[number, number]> {
		return this.#buffered.map(([start, end]) => [start, end]);
	}

	set buffered(regions: TimeRegions | undefined) {
		this.#buffered = sortedRegions(regions);
		this.render();
	}

	get cancellable(): boolean {
		return this.hasAttribute('cancellable');
	}

	set cancellable(isCancellable: boolean) {
		this.reflect('cancellable', isCancellable);
	}

	/** Words a region's `aria-valuetext`; unset, a region speaks its start as the strip speaks a time */
	get formatSpokenRegion(): ((start: Seconds, end: Seconds) => string) | undefined {
		return this.#formatSpokenRegion;
	}

	set formatSpokenRegion(format: ((start: Seconds, end: Seconds) => string) | undefined) {
		this.#formatSpokenRegion = format;
		this.#regions?.render();
	}

	/** One amplitude from 0 to 1 per slice of the whole track, any length; resampled to the bars and never normalised */
	get peaks(): ArrayLike<number> | undefined {
		return this.#peaks;
	}

	set peaks(peaks: ArrayLike<number> | undefined) {
		this.#peaks = peaks;
		this.renderEmpty();
		this.surface()?.invalidate();
	}

	/** A time a release will seek to, drawn as a scrub's edge; a hold or a hover of the strip's own is drawn instead */
	get preview(): Seconds | undefined {
		return this.#preview;
	}

	set preview(seconds: null | Seconds | undefined) {
		this.#preview = Number.isFinite(seconds) ? (seconds ?? undefined) : undefined;
		this.render();
	}

	/** Runs once per point marker on each `markers` or `renderMarker` write; the element lasts until the next */
	get renderMarker(): MarkerRender | undefined {
		return this.#renderMarker;
	}

	set renderMarker(render: MarkerRender | undefined) {
		this.#renderMarker = render;
		this.#drawMarker =
			render &&
			((marker, element) => {
				render({ ...marker }, element);
			});
		if (this.isBound()) this.renderMarkers();
	}

	protected readonly control = renderWavestrip();

	protected readonly canvas = requireChild(
		this.control,
		'.sonic-wavestrip-canvas',
		HTMLCanvasElement,
	);

	protected readonly colours = colours;

	protected readonly lengths = lengths;

	protected readonly numbers = {};

	protected readonly sheet = 'wavestrip.css';

	protected readonly sizeProperty = '--_sonic-wavestrip-size';

	#bars: Path2D | undefined;

	#buffered: Array<[number, number]> = [];

	#drawMarker: MarkerRender | undefined;

	#formatSpokenRegion: ((start: Seconds, end: Seconds) => string) | undefined;

	readonly #markerBand = createMarkerBand<WaveMarker>(
		requireChild(this.control, '.sonic-wavestrip-markers', HTMLDivElement),
	);

	#paintedKey = '';

	#peaks: ArrayLike<number> | undefined;

	#preview: Seconds | undefined;

	#regions: RegionLayer | undefined;

	#renderMarker: MarkerRender | undefined;

	/** Viewport x of a time, clamped to the strip */
	clientXOf(value: Seconds): number {
		const { startPx, travelPx } = this.#axis();

		return startPx + this.mapping().proportionOf(value) * travelPx;
	}

	override connectedCallback(): void {
		this.upgradeProperties(
			'buffered',
			'cancellable',
			'formatSpokenRegion',
			'peaks',
			'preview',
			'renderMarker',
		);
		super.connectedCallback();
	}

	valueFromPoint(clientX: number, _clientY: number): Seconds {
		const { startPx, travelPx } = this.#axis();
		const mapping = this.mapping();

		return clamp(
			mapping.valueAt(clampProportion((clientX - startPx) / travelPx)),
			...mapping.bounds,
		);
	}

	protected override connect(signal: AbortSignal): void {
		const { control } = this;

		this.#regions = new RegionLayer(
			{
				axis: () => this.#axis(),
				control,
				element: this,
				isDisabled: () => this.isDisabled(),
				layer: requireChild(control, '.sonic-wavestrip-regions', HTMLDivElement),
				mapping: () => this.mapping(),
				outside: () => this.#outside(),
				seek: (event) => {
					if (this.input(this.valueFromPoint(event.clientX, event.clientY))) {
						this.dispatchEvent(new Event('change', { bubbles: true }));
					}
				},
				speak: ({ end, start }) =>
					this.#formatSpokenRegion?.(start, end) ??
					this.spokenText(start) ??
					this.notation.format(start),
			},
			signal,
		);
		super.connect(signal);
		this.bindHover(control, signal, {
			changed: () => {
				if (this.#preview !== undefined) this.render();
			},
			place: () => {
				this.#placeReadout();
			},
			valueAt: (event) =>
				this.#markerStartAt(event, this.#axis()) ??
				this.mapping().snap(this.valueFromPoint(event.clientX, event.clientY)),
		});
		this.bindGestures(control, signal, (event) => this.#grab(event));
	}

	protected draw(): void {
		const surface = this.surface();

		this.#placeReadout();
		this.#regions?.follow();
		this.showCurrentMarker(this.scrubState().played);
		if (surface && this.#stripRegions(surface.size.width).key !== this.#paintedKey) {
			surface.requestFrame();
		}
	}

	protected override focusTarget(): HTMLElement {
		return this.canvas;
	}

	protected isEmpty(): boolean {
		return !this.#peaks || this.#peaks.length === 0;
	}

	/** The first point marker is the one a press there snaps to */
	protected markersInReach(point: Point, widthPx: number): Array<number> {
		const regions = this.markerProportions().flatMap(([from, to], index) => {
			const isRegion = this.markerList()[index]?.end !== undefined;

			return isRegion && point.x >= from * widthPx && point.x <= to * widthPx ? [index] : [];
		});

		return [...this.#markerBand.inReach(point, widthPx), ...regions];
	}

	protected paint(context: CanvasRenderingContext2D, frame: SurfaceFrame<Colour, Length>): void {
		const { look, size } = frame;
		const strip = this.#stripRegions(size.width);
		const bars = this.#barsFor(frame);

		this.#paintedKey = strip.key;
		context.clearRect(0, 0, size.width, size.height);
		if (!bars) return;

		context.fillStyle = look.colours.wave;
		context.fill(bars);
		for (const { from, kind, to } of strip.regions) {
			fillRegion(context, bars, [from, to, look.colours[kind]]);
		}
	}

	protected override renderMarkers(): void {
		this.#markerBand.render(this.markerList(), this.markerProportions(), this.#drawMarker);
	}

	protected override scrubsKeyRepeat(): boolean {
		return true;
	}

	protected override usesChild(child: Node): boolean {
		return child instanceof Element && child.localName === 'sonic-region';
	}

	#axis(): ValueAxis & { startPx: number; topPx: number } {
		const box = this.canvas.getBoundingClientRect();

		return {
			position: (event: PointerEvent) => event.clientX,
			startPx: box.left,
			topPx: box.top,
			travelPx: Math.max(1, box.width),
		};
	}

	#barsFor({ isDirty, look, size }: SurfaceFrame<Colour, Length>): Path2D | undefined {
		if (!isDirty && this.#bars) return this.#bars;

		const peaks = this.#peaks;
		const groove = stripGroove(size, look.lengths);
		const drawn = groove ? [groove] : [];
		const bars = peaks && peaks.length > 0 ? stripBars(peaks, size, look.lengths) : drawn;

		this.#bars = undefined;
		if (bars.length === 0) return undefined;

		const path = new Path2D();

		for (const { height, radius, width, x, y } of bars) {
			path.roundRect(x, y, width, height, radius);
		}
		this.#bars = path;

		return path;
	}

	#grab(event: PointerEvent): undefined | ValueAxis {
		const axis = this.#axis();
		const marker = this.#markerStartAt(event, axis);
		const regions = this.#regions;

		if (regions?.isHeld() === true) {
			regions.abandon();
			return undefined;
		}
		if (marker === undefined && regions?.take(event) === true) return undefined;

		const at = (event.clientX - axis.startPx) / axis.travelPx;
		const outside = this.#outside();
		const grabbed = {
			fromProportion: clampProportion(at),
			position: axis.position,
			travelPx: axis.travelPx,
		};

		this.input(marker ?? this.valueFromPoint(event.clientX, event.clientY));

		return outside ? { ...grabbed, outside } : grabbed;
	}

	#markerStartAt(
		{ clientX, clientY }: PointerEvent,
		{ startPx, topPx, travelPx }: { startPx: number; topPx: number; travelPx: number },
	): number | undefined {
		const [index] = this.#markerBand.inReach(
			{ x: clientX - startPx, y: clientY - topPx },
			travelPx,
		);

		return index === undefined ? undefined : this.markerList()[index]?.start;
	}

	#outside(): ((event: PointerEvent) => boolean) | undefined {
		if (!this.cancellable) return undefined;

		const box = this.control.getBoundingClientRect();
		const zone = readPxProperty(
			getComputedStyle(this.control),
			'--_sonic-cancel-zone',
			cancelZonePx,
		);

		return (event) => event.clientY < box.top - zone || event.clientY > box.bottom + zone;
	}

	#placeReadout(): void {
		const at = this.mapping().proportionOf(this.readoutValue());

		this.control.style.setProperty('--_sonic-wavestrip-readout-at', String(at));
	}

	#stripRegions(width: number): StripRegions {
		const mapping = this.mapping();
		const { proportionOf } = mapping;
		const state = this.scrubState();
		const isOwn = state.from !== undefined || this.hoverValue !== undefined;
		const preview = isOwn || this.#preview === undefined ? undefined : proportionOf(this.#preview);
		const { played, scrub = preview } = scrubRegions(state, this.value, mapping);

		return stripRegions(
			{
				buffered: this.#buffered.map(([start, end]) => [proportionOf(start), proportionOf(end)]),
				played,
				...(scrub === undefined ? {} : { scrub }),
			},
			width,
		);
	}
}
