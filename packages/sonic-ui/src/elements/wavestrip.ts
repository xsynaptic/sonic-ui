import type { ValueAxis } from '#elements/value-gestures.ts';
import type { WaveMarker } from '#elements/wave-element.ts';
import type { BandLevels } from '#lib/band-levels.ts';
import type { SurfaceFrame } from '#lib/canvas-surface.ts';
import type { Point } from '#lib/marker-band.ts';
import type { Oklch } from '#lib/oklch.ts';
import type { StripRegions } from '#lib/strip-scene.ts';
import type { StripTintSources } from '#lib/strip-tint.ts';
import type { TimeRegions } from '#lib/time-regions.ts';
import type { Seconds } from '#lib/units.ts';
import type { TintCell } from '#lib/wave-tint.ts';

import { RegionLayer } from '#elements/region-layer.ts';
import { SonicValueEvent } from '#elements/value-event.ts';
import { paintedChannels, SonicWaveElement } from '#elements/wave-element.ts';
import { levelTable } from '#lib/band-levels.ts';
import { outsideCancelZone } from '#lib/cancel-zone.ts';
import { createMarkerBand } from '#lib/marker-band.ts';
import { clamp, clampProportion } from '#lib/math.ts';
import { blendOklch, oklchOf, rgbOf } from '#lib/oklch.ts';
import { requireChild, template } from '#lib/render.ts';
import { scrubRegions } from '#lib/scrub.ts';
import { barLayout, stripBars, stripGroove, stripRegions } from '#lib/strip-scene.ts';
import { stripTintReadiness, stripTints } from '#lib/strip-tint.ts';
import { sortedRegions } from '#lib/time-regions.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-wavestrip': SonicWavestrip;
	}
}

type Colour = keyof typeof colours;

type Length = keyof typeof lengths;

type Numeric = keyof typeof numbers;

type StateKind = (typeof stateKinds)[number];

interface StripTint {
	count: number;
	images: Partial<Record<StateKind, ImageData>>;
	pitch: number;
	strip: CanvasRenderingContext2D;
}

export type MarkerRender = (marker: WaveMarker, element: HTMLElement) => void;

const colours = {
	buffered: '--_sonic-wavestrip-buffered',
	played: '--_sonic-wavestrip-played',
	scrub: '--_sonic-wavestrip-scrub',
	wave: '--_sonic-wavestrip-wave',
} as const;

const numbers = {
	bufferedTintAmount: '--_sonic-wavestrip-buffered-tint-amount',
	playedTintAmount: '--_sonic-wavestrip-played-tint-amount',
	scrubTintAmount: '--_sonic-wavestrip-scrub-tint-amount',
	tintOff: '--_sonic-wavestrip-tint-off',
	tintSensitivity: '--_sonic-wavestrip-tint-sensitivity',
	tintSteps: '--_sonic-wavestrip-tint-steps',
	waveTintAmount: '--_sonic-wavestrip-tint-amount',
} as const satisfies Record<string, `--_sonic-${string}`>;

const stateKinds = ['wave', 'buffered', 'played', 'scrub'] as const;

const amountOf = {
	buffered: 'bufferedTintAmount',
	played: 'playedTintAmount',
	scrub: 'scrubTintAmount',
	wave: 'waveTintAmount',
} as const satisfies Record<StateKind, Numeric>;

const lengths = {
	gapRatio: '--_sonic-wavestrip-bar-gap-ratio',
	grooveRatio: '--_sonic-wavestrip-groove-ratio',
	grooveSize: '--_sonic-wavestrip-groove-size',
	pitch: '--_sonic-wavestrip-bar-pitch',
	radiusRatio: '--_sonic-wavestrip-bar-radius-ratio',
} as const;

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

function unlitProbe(): HTMLDivElement {
	const probe = document.createElement('div');

	probe.style.setProperty('color', 'var(--_sonic-unlit-solid)');

	return probe;
}

function stateImage(
	state: Oklch | undefined,
	tints: ReadonlyArray<Oklch>,
	amount: number,
): ImageData | undefined {
	if (!state || tints.length === 0 || !(amount > 0)) return undefined;

	const pixels = new Uint8ClampedArray(tints.length * 4);

	for (const [bar, tint] of tints.entries()) {
		const [red, green, blue] = rgbOf(blendOklch(state, tint, amount));

		pixels.set([red, green, blue, 255], bar * 4);
	}

	return new ImageData(pixels, tints.length, 1);
}

function drawTint(
	context: CanvasRenderingContext2D,
	{ count, pitch, strip }: StripTint,
	image: ImageData,
): void {
	if (strip.canvas.width < count) strip.canvas.width = count;
	strip.putImageData(image, 0, 0);
	context.imageSmoothingEnabled = false;
	context.drawImage(strip.canvas, 0, 0, count, 1, 0, 0, count * pitch, context.canvas.height);
	context.imageSmoothingEnabled = true;
}

export class SonicWavestrip extends SonicWaveElement<Colour, Length, Numeric> {
	/** One row per slice of the whole track, in any number of slices, stretched to fit the bars as `peaks` is */
	get bands(): BandLevels | undefined {
		return this.#bands;
	}

	set bands(bands: BandLevels | undefined) {
		this.#bands = bands;
		this.#bandTable = levelTable(bands);
		this.surface()?.invalidate();
	}

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

	/** The track's quiet and loud slices in the units of `peaks`, read as linear amplitude: the 10th and 95th percentiles of the slices above -60 dBFS */
	get peaksRange(): readonly [quiet: number, loud: number] | undefined {
		return this.#peaksRange;
	}

	set peaksRange(range: readonly [quiet: number, loud: number] | undefined) {
		this.#peaksRange = range && [range[0], range[1]];
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

	protected override readonly control = renderWavestrip();

	protected readonly canvas = requireChild(
		this.control,
		'.sonic-wavestrip-canvas',
		HTMLCanvasElement,
	);

	protected readonly colours = colours;

	protected readonly lengths = lengths;

	protected readonly numbers = numbers;

	protected override readonly sheet = 'wavestrip.css';

	protected readonly sizeProperty = '--_sonic-wavestrip-size';

	#bands: BandLevels | undefined;

	#bandTable: ReturnType<typeof levelTable>;

	#bars: Path2D | undefined;

	#buffered: Array<[number, number]> = [];

	#drawMarker: MarkerRender | undefined;

	#formatSpokenRegion: ((start: Seconds, end: Seconds) => string) | undefined;

	readonly #markerBand = createMarkerBand<WaveMarker>(
		requireChild(this.control, '.sonic-wavestrip-markers', HTMLDivElement),
	);

	#paintedKey = '';

	#peaks: ArrayLike<number> | undefined;

	#peaksRange: readonly [number, number] | undefined;

	#preview: Seconds | undefined;

	#regions: RegionLayer | undefined;

	#renderMarker: MarkerRender | undefined;

	#stateColours = new Map<string, Oklch | undefined>();

	#tint: StripTint | undefined;

	#tintKey = '';

	#tintStops: Array<Oklch> | undefined;

	/** Viewport x of a time, clamped to the strip */
	clientXOf(value: Seconds): number {
		const { startPx, travelPx } = this.#axis();

		return startPx + this.mapping().proportionOf(value) * travelPx;
	}

	override connectedCallback(): void {
		this.upgradeProperties(
			'buffered',
			'cancellable',
			'bands',
			'formatSpokenRegion',
			'peaks',
			'peaksRange',
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
					if (this.input(this.valueFromPoint(event.clientX, event.clientY), 'tap')) {
						this.dispatchEvent(new SonicValueEvent('change', 'tap'));
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
		this.bindGestures(signal, (event) => this.#grab(event));
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

	protected paint(
		context: CanvasRenderingContext2D,
		frame: SurfaceFrame<Colour, Length, Numeric>,
	): void {
		const { look, size } = frame;
		const strip = this.#stripRegions(size.width);
		const bars = this.#barsFor(frame);

		this.#paintedKey = strip.key;
		context.clearRect(0, 0, size.width, size.height);
		if (!bars) return;

		const tint = this.#tintFor(frame);

		context.fillStyle = look.colours.wave;
		context.fill(bars);
		// The bars act as a mask, so from here on only the pixels they cover take colour
		context.globalCompositeOperation = 'source-atop';
		if (tint?.images.wave) drawTint(context, tint, tint.images.wave);
		for (const { from, kind, to } of strip.regions) {
			const image = tint?.images[kind];

			if (!tint || !image) {
				fillRegion(context, bars, [from, to, look.colours[kind]]);
				continue;
			}
			context.save();
			context.beginPath();
			context.rect(from, 0, to - from, size.height);
			context.clip();
			drawTint(context, tint, image);
			context.restore();
		}
		context.globalCompositeOperation = 'source-over';
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

		this.input(marker ?? this.valueFromPoint(event.clientX, event.clientY), 'drag');

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

		return outsideCancelZone(this.control, '--_sonic-wavestrip-cancel-zone');
	}

	#placeReadout(): void {
		const at = this.mapping().proportionOf(this.readoutValue());

		this.control.style.setProperty('--_sonic-wavestrip-readout-at', String(at));
	}

	// Without a skin a state colour is translucent, so it is read as painted over the solid unlit surface
	#stateColour(strip: CanvasRenderingContext2D, colour: string): Oklch | undefined {
		if (this.#stateColours.has(colour)) return this.#stateColours.get(colour);

		const [surface = 'transparent'] = this.readProbes([unlitProbe()]);
		const channels = paintedChannels(strip, surface, colour);
		const read = channels && oklchOf(channels);

		this.#stateColours.set(colour, read);

		return read;
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

	#tintFor({
		isDirty,
		isRebuilt,
		look,
		size,
	}: SurfaceFrame<Colour, Length, Numeric>): StripTint | undefined {
		const ready = this.#tintReady(look.numbers, isRebuilt);
		if (!ready) return undefined;

		const { numbers: read } = look;
		const { count, pitch } = barLayout(size, look.lengths);
		const key = [
			count,
			read.tintSteps,
			read.tintSensitivity,
			...stateKinds.map((kind) => `${look.colours[kind]}=${String(read[amountOf[kind]])}`),
		].join('|');
		if (!isDirty && !isRebuilt && this.#tint && key === this.#tintKey) return this.#tint;

		const tints = stripTints(ready.cell, ready.sources, [
			{ peaksDepth: 0, steps: read.tintSteps, stops: ready.stops, surfaceLightness: 0 },
			read.tintSensitivity,
			count,
		]);
		const images: StripTint['images'] = {};

		for (const kind of stateKinds) {
			const state = this.#stateColour(ready.strip, look.colours[kind]);
			const image = stateImage(state, tints, read[amountOf[kind]]);

			if (image) images[kind] = image;
		}
		this.#tintKey = key;
		this.#tint = { count, images, pitch, strip: ready.strip };

		return this.#tint;
	}

	#tintReady(
		read: Record<Numeric, number>,
		isRebuilt: boolean,
	):
		| undefined
		| {
				cell: TintCell;
				sources: StripTintSources;
				stops: Array<Oklch>;
				strip: CanvasRenderingContext2D;
		  } {
		if (read.tintOff > 0) return undefined;

		const sources = { bands: this.#bandTable, peaks: this.#peaks, peaksRange: this.#peaksRange };
		const readiness = stripTintReadiness(this.tintCell(), sources);
		const strip = this.readyTintCanvas(readiness, {
			'bands.medians': this.#bands,
			peaksRange: this.#peaks,
		});
		if (!strip || !readiness.isReady) return undefined;

		if (isRebuilt || !this.#tintStops) {
			this.#stateColours.clear();
			this.#tintStops = this.readTintPalette(strip, 'wavestrip').stops;
		}

		return { cell: readiness.cell, sources, stops: this.#tintStops, strip };
	}
}
