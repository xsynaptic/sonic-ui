import type { ValueAxis } from '#elements/value-gestures.ts';
import type { WaveMarker } from '#elements/wave-element.ts';
import type { SurfaceFrame } from '#lib/canvas-surface.ts';
import type { Drawn } from '#lib/frame-timeline.ts';
import type { Point } from '#lib/marker-band.ts';
import type { PeaksRequest } from '#lib/peaks-request.ts';
import type { TimeRegions } from '#lib/time-regions.ts';
import type { Milliseconds, PixelsPerSecond, Seconds } from '#lib/units.ts';
import type { BandChannels, WaveformBands } from '#lib/waveform-bands.ts';
import type { WaveformPeaks } from '#lib/waveform-buckets.ts';
import type { WaveformTint } from '#lib/waveform-scene.ts';
import type { ZoomGesture } from '#lib/zoom-gesture.ts';

import { SonicWaveElement } from '#elements/wave-element.ts';
import { frameTimeline } from '#lib/frame-timeline.ts';
import { isKind, writeKind } from '#lib/marker-band.ts';
import { createLabelRider } from '#lib/marker-rider.ts';
import { clamp, roundTo } from '#lib/math.ts';
import { createPeaksRequest } from '#lib/peaks-request.ts';
import { requireChild, template } from '#lib/render.ts';
import { dueRegions, readRegions } from '#lib/time-regions.ts';
import { createTrackingClock } from '#lib/tracking-clock.ts';
import { bandTable } from '#lib/waveform-bands.ts';
import {
	bandChannels,
	paintWaveform,
	waveformColours,
	waveformNumbers,
} from '#lib/waveform-scene.ts';
import { bindZoom, bindZoomKeys } from '#lib/zoom-gesture.ts';

export type { PeaksRequest } from '#lib/peaks-request.ts';

declare global {
	interface HTMLElementEventMap {
		'sonic-zoom': Event;
	}

	interface HTMLElementTagNameMap {
		'sonic-waveform': SonicWaveform;
	}
}

type Colour = keyof typeof waveformColours;

type Numeric = keyof typeof waveformNumbers;

export type LabelRender = (marker: WaveMarker, element: HTMLElement) => void;

const defaultZoom = 70;
const defaultZoomMin = 20;
const defaultZoomMax = 280;
const lineReachPx = 4;

const renderWaveform = template(
	/* HTML */ `
		<div class="sonic-waveform" role="slider" tabindex="0">
			<canvas class="sonic-waveform-canvas" aria-hidden="true"></canvas>
			<div class="sonic-waveform-scrim" aria-hidden="true"></div>
			<div class="sonic-waveform-ghost" aria-hidden="true" hidden></div>
			<div class="sonic-waveform-playhead" aria-hidden="true"></div>
			<div class="sonic-waveform-label" aria-hidden="true" hidden></div>
			<div class="sonic-waveform-label" aria-hidden="true" hidden></div>
			<div class="sonic-waveform-readout" popover="manual">
				<span></span>
				<input
					autocomplete="off"
					class="sonic-waveform-entry"
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

function placeLine(line: HTMLElement, at: number | undefined): void {
	const isHidden = at === undefined || at < 0 || at > 1;

	if (line.hidden !== isHidden) line.hidden = isHidden;
	if (isHidden) return;

	const translate = `${String(at * 100)}cqi`;

	if (line.style.getPropertyValue('translate') !== translate) {
		line.style.setProperty('translate', translate);
	}
}

export class SonicWaveform extends SonicWaveElement<Colour, never, Numeric> {
	static override readonly observedAttributes = [
		...SonicWaveElement.observedAttributes,
		'pending-delay',
		'playing',
		'playback-rate',
		'reduced-motion',
		'zoom',
		'zoom-max',
		'zoom-min',
		'zoomable',
	];

	get bands(): undefined | WaveformBands {
		return this.#bands;
	}

	set bands(bands: undefined | WaveformBands) {
		this.#bands = bands;
		this.#bandTable = bandTable(bands);
		this.#peaksRequest.changed();
	}

	get peaks(): undefined | WaveformPeaks {
		return this.#peaks;
	}

	set peaks(peaks: undefined | WaveformPeaks) {
		this.#peaks = peaks;
		this.renderEmpty();
		this.#peaksRequest.changed();
	}

	/** Spans being fetched; drawn as placeholders until cleared */
	get pending(): Array<[Seconds, Seconds]> {
		return this.#pending.map(([start, end]) => [start, end]);
	}

	set pending(regions: TimeRegions | undefined) {
		const pending = regions ? readRegions(regions) : [];
		if (String(pending) === String(this.#pending)) return;

		const listedMs = this.#pendingListedMs;
		const nowMs = performance.now();

		this.#pending = pending;
		this.#pendingListedMs = new Map(
			this.#pending.map((region) => {
				const key = region.join(':');

				return [key, listedMs.get(key) ?? nowMs];
			}),
		);
		this.#peaksRequest.changed();
	}

	/** How long a span stays listed in `pending` before its placeholder draws */
	get pendingDelay(): Milliseconds {
		return Math.max(0, this.numberAttribute('pending-delay', 0));
	}

	set pendingDelay(value: Milliseconds | undefined) {
		this.reflect('pending-delay', value);
	}

	get playbackRate(): number {
		const playbackRate = this.numberAttribute('playback-rate', 1);

		return playbackRate > 0 ? playbackRate : 1;
	}

	set playbackRate(value: number | undefined) {
		this.reflect('playback-rate', value);
	}

	get playing(): boolean {
		return this.hasAttribute('playing');
	}

	set playing(isPlaying: boolean) {
		this.reflect('playing', isPlaying);
	}

	/** Read every frame for the playback time, so the waveform scrolls smoother than writes to `value` arrive */
	get readTime(): (() => Seconds | undefined) | undefined {
		return this.#readTime;
	}

	set readTime(read: (() => Seconds | undefined) | undefined) {
		this.#readTime = read;
		this.render();
	}

	get reducedMotion(): 'page' | 'scroll' {
		return this.getAttribute('reduced-motion') === 'scroll' ? 'scroll' : 'page';
	}

	set reducedMotion(motion: 'page' | 'scroll' | undefined) {
		this.reflect('reduced-motion', motion);
	}

	get renderLabel(): LabelRender | undefined {
		return this.#renderLabel;
	}

	set renderLabel(render: LabelRender | undefined) {
		this.#renderLabel = render;
		if (this.isBound()) this.renderMarkers();
	}

	get requestPeaks(): PeaksRequest | undefined {
		return this.#requestPeaks;
	}

	set requestPeaks(request: PeaksRequest | undefined) {
		this.#requestPeaks = request;
		this.#peaksRequest.reset();
	}

	get zoom(): PixelsPerSecond {
		const zoom = this.numberAttribute('zoom', defaultZoom);

		return zoom > 0 ? zoom : defaultZoom;
	}

	set zoom(value: PixelsPerSecond | undefined) {
		this.reflect('zoom', value);
	}

	get zoomable(): boolean {
		return this.hasAttribute('zoomable');
	}

	set zoomable(isZoomable: boolean) {
		this.reflect('zoomable', isZoomable);
	}

	get zoomMax(): PixelsPerSecond {
		const zoomMax = this.numberAttribute('zoom-max', defaultZoomMax);

		return Math.max(this.zoomMin, zoomMax > 0 ? zoomMax : defaultZoomMax);
	}

	set zoomMax(value: PixelsPerSecond | undefined) {
		this.reflect('zoom-max', value);
	}

	get zoomMin(): PixelsPerSecond {
		const zoomMin = this.numberAttribute('zoom-min', defaultZoomMin);

		return zoomMin > 0 ? zoomMin : defaultZoomMin;
	}

	set zoomMin(value: PixelsPerSecond | undefined) {
		this.reflect('zoom-min', value);
	}

	protected override readonly control = renderWaveform();

	protected readonly canvas = requireChild(
		this.control,
		'.sonic-waveform-canvas',
		HTMLCanvasElement,
	);

	protected readonly colours = waveformColours;

	protected readonly lengths = {};

	protected readonly numbers = waveformNumbers;

	protected override readonly sheet = 'waveform.css';

	protected readonly sizeProperty = '--_sonic-waveform-size';

	#bandColours: Array<BandChannels | undefined> = [];

	#bands: undefined | WaveformBands;

	#bandTable: ReturnType<typeof bandTable>;

	readonly #clock = createTrackingClock();

	#drawn: (Drawn & { zoom: PixelsPerSecond }) | undefined;

	readonly #ghost = requireChild(this.control, '.sonic-waveform-ghost', HTMLDivElement);

	#grabbed: Drawn | undefined;

	#kindColours = new Map<string, string>();

	#paintedKey = '';

	#peaks: undefined | WaveformPeaks;

	readonly #peaksRequest = createPeaksRequest(() => {
		this.surface()?.invalidate();
	});

	#pending: Array<[number, number]> = [];

	#pendingListedMs = new Map<string, number>();

	readonly #playhead = requireChild(this.control, '.sonic-waveform-playhead', HTMLDivElement);

	#readTime: (() => number | undefined) | undefined;

	#renderLabel: LabelRender | undefined;

	#requestPeaks: PeaksRequest | undefined;

	readonly #rider = createLabelRider(this.control, {
		className: 'sonic-waveform-label',
		colourProperty: '--_sonic-waveform-marker',
		fadeProperties: ['--_sonic-waveform-label-fade-start', '--_sonic-waveform-label-fade-end'],
		insetProperty: '--_sonic-waveform-label-inset',
		parkProperty: '--_sonic-waveform-label-park',
	});

	#strip: CanvasRenderingContext2D | undefined;

	#zoomGesture: undefined | ZoomGesture;

	override attributeChangedCallback(name: string): void {
		super.attributeChangedCallback(name);
		if (name === 'zoomable') this.#zoomGesture?.sync();
	}

	/** Viewport x of a time as last drawn; not clamped to the window */
	clientXOf(value: Seconds): number {
		const { left, width } = this.canvas.getBoundingClientRect();

		return left + this.#drawnX(value, width);
	}

	override connectedCallback(): void {
		this.upgradeProperties(
			'bands',
			'peaks',
			'pending',
			'pendingDelay',
			'playing',
			'playbackRate',
			'readTime',
			'reducedMotion',
			'renderLabel',
			'requestPeaks',
			'zoom',
			'zoomable',
			'zoomMax',
			'zoomMin',
		);
		super.connectedCallback();
	}

	/** The time at a viewport x as last drawn */
	valueFromPoint(clientX: number, _clientY: number): Seconds {
		const { left, width } = this.canvas.getBoundingClientRect();
		const { startSeconds, zoom } = this.#drawnWindow(width);

		return clamp(startSeconds + (clientX - left) / zoom, ...this.mapping().bounds);
	}

	protected override connect(signal: AbortSignal): void {
		super.connect(signal);

		const zoomTarget = {
			claim: () => {
				this.abandonHold();
			},
			isDisabled: () => this.isDisabled(),
			isZoomable: () => this.zoomable,
			zoom: () => this.zoom,
			zoomTo: (target: number) => {
				this.#zoomTo(target);
			},
		};

		this.#zoomGesture = bindZoom(this.control, zoomTarget, signal);
		this.bindGestures(signal, () => this.#grab());
		// After the value keys, which stand down once a key is taken
		bindZoomKeys(this.control, zoomTarget, signal);
		if (!('fonts' in document)) return;

		document.fonts.addEventListener(
			'loadingdone',
			() => {
				this.renderMarkers();
			},
			{ signal },
		);
	}

	protected draw(): void {
		const surface = this.surface();

		surface?.requestFrame();
		// No frame follows the position out of view, or before the first one paints
		if (surface?.isVisible === false || !this.#drawn) this.showCurrentMarker(this.#sourceSeconds());
	}

	protected isEmpty(): boolean {
		return !this.#peaks || this.#peaks.samples.length === 0;
	}

	// The canvas paints a region as its start line alone
	protected markersInReach({ x }: Point, widthPx: number): Array<number> {
		return this.markerList()
			.map(({ start }, index) => ({
				distance: Math.abs(this.#drawnX(start, widthPx) - x),
				index,
			}))
			.filter(({ distance }) => distance <= lineReachPx)
			.toSorted((first, second) => first.distance - second.distance)
			.map(({ index }) => index);
	}

	protected paint(
		context: CanvasRenderingContext2D,
		{ frameMs, isDirty, isRebuilt, look, size }: SurfaceFrame<Colour, never, Numeric>,
	): void {
		const held = this.#held();
		const isPaged = look.isReducedMotion && this.reducedMotion === 'page';
		const pending = this.#duePending();
		const range: [number, number] = [this.min, Math.max(this.min, this.max)];
		const timeline = frameTimeline({
			clockSeconds: this.#clock.read(frameMs, {
				isPlaying: this.playing,
				playbackRate: this.playbackRate,
				seconds: this.#sourceSeconds(),
			}),
			frameMs,
			...(held ? { held } : {}),
			isPaged,
			isPlaying: this.playing,
			isStill: look.isReducedMotion,
			pending,
			range,
			size,
			zoom: this.zoom,
		});
		const { seconds, view } = timeline;

		this.#drawn = { seconds, startSeconds: view.startSeconds, zoom: this.zoom };
		placeLine(this.#playhead, timeline.playheadAt);
		placeLine(this.#ghost, timeline.ghostAt);
		this.showCurrentMarker(seconds);
		this.toggleState('pending', view.pending.length > 0);
		this.#rider.place({
			isPaged,
			playheadSeconds: seconds,
			startSeconds: view.startSeconds,
			widthPx: view.width / view.dpr,
			windowSeconds: view.width / view.pixelsPerSecond,
		});
		if (isDirty || timeline.paintKey !== this.#paintedKey) {
			this.#paintedKey = timeline.paintKey;
			if (isRebuilt) this.#kindColours = this.#readKindColours();
			paintWaveform(
				context,
				{ ...view, colours: look.colours, numbers: look.numbers },
				{
					bands: this.#tint(isRebuilt),
					kindColours: this.#kindColours,
					markers: this.markerList().map((marker) => ({
						...marker,
						start: clamp(marker.start, ...range),
					})),
					peaks: this.#peaks,
					range,
				},
			);
			this.#peaksRequest.ask(this.#requestPeaks, timeline.wanted);
		}
		if (timeline.isMoving) this.surface()?.requestFrame();
	}

	protected override renderMarkers(): void {
		const bounds = this.mapping().bounds;

		const render = this.#renderLabel;

		this.#rider.measure(
			this.markers.flatMap((marker) =>
				marker.label === undefined || marker.label === ''
					? []
					: [
							{
								isDimmed: marker.dimmed === true,
								...(marker.kind === undefined ? {} : { kind: marker.kind }),
								start: clamp(marker.start, ...bounds),
								text: marker.label,
								...(render
									? {
											write: (element: HTMLElement) => {
												render(marker, element);
											},
										}
									: {}),
							},
						],
			),
		);
		this.surface()?.rebuild();
	}

	protected override scrubChanged(): void {
		const isScrubbing = this.scrubState().from !== undefined;

		this.#grabbed = isScrubbing ? (this.#grabbed ?? this.#lastDrawn()) : undefined;
		super.scrubChanged();
	}

	protected override scrubsKeyRepeat(): boolean {
		return true;
	}

	// Before the first frame, the window a centerd playhead would draw
	#drawnWindow(widthPx: number): { startSeconds: Seconds; zoom: PixelsPerSecond } {
		const zoom = this.#drawn?.zoom ?? this.zoom;

		return { startSeconds: this.#drawn?.startSeconds ?? this.value - widthPx / zoom / 2, zoom };
	}

	#drawnX(value: Seconds, widthPx: number): number {
		const { startSeconds, zoom } = this.#drawnWindow(widthPx);

		return (clamp(value, ...this.mapping().bounds) - startSeconds) * zoom;
	}

	#duePending(): Array<[number, number]> {
		const due = dueRegions(this.#pending, this.#pendingListedMs, [
			performance.now(),
			this.pendingDelay,
		]);

		if (due.length < this.#pending.length) this.surface()?.requestFrame();

		return due;
	}

	#grab(): undefined | ValueAxis {
		if (this.#zoomGesture?.isPinching() === true) return undefined;

		const drawn = this.#lastDrawn();

		this.#grabbed = drawn;

		const mapping = this.mapping();
		const [low, high] = mapping.bounds;

		return {
			fromProportion: mapping.proportionOf(drawn.seconds),
			isKeptOnCancel: true,
			position: (event) => -event.clientX,
			travelPx: Math.max(1, (high - low) * this.zoom),
		};
	}

	#held(): undefined | { grabbed: Drawn; seconds: number } {
		const grabbed = this.#grabbed;
		const { from } = this.scrubState();
		if (!grabbed || from === undefined) return undefined;

		return { grabbed, seconds: this.value === from ? grabbed.seconds : this.value };
	}

	#lastDrawn(): Drawn {
		return this.#drawn ?? { seconds: this.value, startSeconds: this.value };
	}

	#readBandColours(
		strip: CanvasRenderingContext2D,
		bandCount: number,
	): Array<BandChannels | undefined> {
		const probes = Array.from({ length: bandCount }, (_probe, band) => {
			const probe = document.createElement('div');

			probe.style.setProperty(
				'color',
				`var(--sonic-waveform-band-${String(band + 1)}, transparent)`,
			);

			return probe;
		});

		return this.#readProbes(probes).map((colour) => bandChannels(strip, colour));
	}

	#readKindColours(): Map<string, string> {
		const kinds = [...new Set(this.markers.map(({ kind }) => kind).filter((kind) => isKind(kind)))];
		const probes = kinds.map((kind) => {
			const probe = document.createElement('div');

			probe.className = 'sonic-waveform-label';
			writeKind(probe, kind, '--_sonic-waveform-marker');

			return probe;
		});

		const read = this.#readProbes(probes);

		return new Map(kinds.map((kind, index) => [kind, read[index] ?? '']));
	}

	#readProbes(probes: Array<HTMLElement>): Array<string> {
		this.control.append(...probes);

		const read = probes.map((probe) => getComputedStyle(probe).color);

		for (const probe of probes) probe.remove();

		return read;
	}

	#sourceSeconds(): number {
		return this.#readTime?.() ?? this.scrubState().played;
	}

	#tint(isRebuilt: boolean): undefined | WaveformTint {
		const table = this.#bandTable;
		if (!table) return undefined;

		const strip =
			this.#strip ??
			document.createElement('canvas').getContext('2d', { willReadFrequently: true }) ??
			undefined;
		if (!strip) return undefined;

		this.#strip = strip;

		if (isRebuilt || this.#bandColours.length !== table.bandCount) {
			strip.canvas.height = 1;
			this.#bandColours = this.#readBandColours(strip, table.bandCount);
		}

		return { colours: this.#bandColours, strip, table };
	}

	#zoomTo(target: number): void {
		const next = roundTo(clamp(target, this.zoomMin, this.zoomMax), 2);
		if (next === this.zoom) return;

		this.zoom = next;
		this.dispatchEvent(new Event('sonic-zoom', { bubbles: true }));
	}
}
