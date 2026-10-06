import type { ValueAxis } from '#elements/value-gestures.ts';
import type { WaveMarker } from '#elements/wave-element.ts';
import type { SurfaceFrame, SurfaceLook } from '#lib/canvas-surface.ts';
import type { Drawn, View } from '#lib/frame-timeline.ts';
import type { TimeRegions } from '#lib/time-regions.ts';
import type { WaveformPeaks } from '#lib/waveform-buckets.ts';

import { SonicWaveElement } from '#elements/wave-element.ts';
import { frameTimeline } from '#lib/frame-timeline.ts';
import { isKind, writeKind } from '#lib/marker-band.ts';
import { createLabelRider } from '#lib/marker-rider.ts';
import { clamp, roundTo } from '#lib/math.ts';
import { capturePointer } from '#lib/pointer-drag.ts';
import { requireChild, template } from '#lib/render.ts';
import { dueRegions, readRegions } from '#lib/time-regions.ts';
import { createTrackingClock } from '#lib/tracking-clock.ts';
import { waveformBuckets } from '#lib/waveform-buckets.ts';
import { pinchFactor, wheelFactor, zoomKeyFactor } from '#lib/zoom-gesture.ts';

declare global {
	interface HTMLElementEventMap {
		'sonic-zoom': Event;
	}

	interface HTMLElementTagNameMap {
		'sonic-waveform': SonicWaveform;
	}
}

type Colour = keyof typeof colours;

export type LabelRender = (marker: WaveMarker, element: HTMLElement) => void;

export type PeaksRequest = (
	fromSeconds: number,
	toSeconds: number,
) => Iterable<Promise<unknown>> | Promise<unknown> | undefined;

interface Pinch {
	pointerIds: [number, number];
	startSpanPx: number;
	startZoom: number;
}

interface Scene extends View {
	colours: SurfaceLook<Colour>['colours'];
}

const colours = {
	ends: '--_sonic-waveform-ends',
	grid: '--_sonic-waveform-grid',
	marker: '--_sonic-waveform-marker',
	placeholder: '--_sonic-waveform-placeholder',
	wave: '--_sonic-waveform-wave',
	waveEdge: '--_sonic-waveform-wave-edge',
} as const;

const defaultZoom = 70;
const defaultZoomMin = 20;
const defaultZoomMax = 280;

const zoomKeys = new Map([
	['+', 1],
	['-', -1],
	['=', 1],
]);

const amplitudeMargin = 0.94;

const hatchPitchPx = 8;
const placeholderWavelengthPx = 48;
const placeholderAmplitude = 0.2;

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

function paintHatch(
	context: CanvasRenderingContext2D,
	scene: Scene,
	[from, to]: [number, number],
): void {
	if (to <= from) return;

	const { dpr, height } = scene;
	const pitch = Math.max(2, Math.round(hatchPitchPx * dpr));
	const offset = scene.startSeconds * scene.pixelsPerSecond;

	context.save();
	context.beginPath();
	context.rect(from, 0, to - from, height);
	context.clip();
	context.beginPath();
	for (let x = Math.floor((from - height + offset) / pitch) * pitch - offset; x < to; x += pitch) {
		context.moveTo(x, height);
		context.lineTo(x + height, 0);
	}
	context.lineWidth = Math.max(1, Math.round(dpr));
	context.strokeStyle = scene.colours.ends;
	context.stroke();
	context.restore();
}

function paintPlaceholders(context: CanvasRenderingContext2D, scene: Scene): void {
	if (scene.pending.length === 0) return;

	const { dpr, height, pixelsPerSecond, startSeconds } = scene;
	const wavelength = placeholderWavelengthPx * dpr;
	const center = height / 2;
	const origin = startSeconds * pixelsPerSecond;
	const waveY = (x: number): number =>
		center -
		Math.sin(((x + origin) / wavelength + scene.phase) * 2 * Math.PI) *
			center *
			placeholderAmplitude;

	context.beginPath();
	for (const [from, to] of scene.pending) {
		const opening = (from - startSeconds) * pixelsPerSecond;
		const closing = (to - startSeconds) * pixelsPerSecond;

		context.moveTo(opening, waveY(opening));
		for (let x = opening + dpr; x < closing; x += dpr) context.lineTo(x, waveY(x));
		context.lineTo(closing, waveY(closing));
	}
	context.lineWidth = Math.max(1, Math.round(dpr));
	context.strokeStyle = scene.colours.placeholder;
	context.stroke();
}

function waveFill(context: CanvasRenderingContext2D, scene: Scene): CanvasGradient {
	const { wave, waveEdge } = scene.colours;
	const gradient = context.createLinearGradient(0, 0, 0, scene.height);

	gradient.addColorStop(0, waveEdge);
	gradient.addColorStop(0.5, wave);
	gradient.addColorStop(1, waveEdge);

	return gradient;
}

function paintWave(context: CanvasRenderingContext2D, scene: Scene, peaks: WaveformPeaks): void {
	const buckets = waveformBuckets(peaks, scene);
	const [first] = buckets;
	if (!first) return;

	const center = scene.height / 2;
	const amplitudePx = center * amplitudeMargin;

	context.fillStyle = waveFill(context, scene);
	context.beginPath();
	context.moveTo(first.x, center);
	for (const bucket of buckets) context.lineTo(bucket.x, center - bucket.high * amplitudePx);
	for (const bucket of buckets.toReversed())
		context.lineTo(bucket.x, center - bucket.low * amplitudePx);
	context.closePath();
	context.fill();
}

export class SonicWaveform extends SonicWaveElement<Colour> {
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

	get peaks(): undefined | WaveformPeaks {
		return this.#peaks;
	}

	set peaks(peaks: undefined | WaveformPeaks) {
		this.#peaks = peaks;
		this.renderEmpty();
		this.#repaint();
	}

	get pending(): Array<[number, number]> {
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
		this.#repaint();
	}

	get pendingDelay(): number {
		return Math.max(0, this.numberAttribute('pending-delay', 0));
	}

	set pendingDelay(value: number | undefined) {
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

	get readTime(): (() => number | undefined) | undefined {
		return this.#readTime;
	}

	set readTime(read: (() => number | undefined) | undefined) {
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
		this.#askedKey = undefined;
		this.surface()?.invalidate();
	}

	get zoom(): number {
		const zoom = this.numberAttribute('zoom', defaultZoom);

		return zoom > 0 ? zoom : defaultZoom;
	}

	set zoom(value: number | undefined) {
		this.reflect('zoom', value);
	}

	get zoomable(): boolean {
		return this.hasAttribute('zoomable');
	}

	set zoomable(isZoomable: boolean) {
		this.reflect('zoomable', isZoomable);
	}

	get zoomMax(): number {
		const zoomMax = this.numberAttribute('zoom-max', defaultZoomMax);

		return Math.max(this.zoomMin, zoomMax > 0 ? zoomMax : defaultZoomMax);
	}

	set zoomMax(value: number | undefined) {
		this.reflect('zoom-max', value);
	}

	get zoomMin(): number {
		const zoomMin = this.numberAttribute('zoom-min', defaultZoomMin);

		return zoomMin > 0 ? zoomMin : defaultZoomMin;
	}

	set zoomMin(value: number | undefined) {
		this.reflect('zoom-min', value);
	}

	protected readonly control = renderWaveform();

	protected readonly canvas = requireChild(
		this.control,
		'.sonic-waveform-canvas',
		HTMLCanvasElement,
	);

	protected readonly colours = colours;

	protected readonly lengths = {};

	protected readonly sheet = 'waveform.css';

	protected readonly sizeProperty = '--_sonic-waveform-size';

	readonly #asked = new WeakSet<Promise<unknown>>();

	#askedKey: string | undefined;

	readonly #clock = createTrackingClock();

	#connection: AbortSignal | undefined;

	#drawn: Drawn | undefined;

	readonly #ghost = requireChild(this.control, '.sonic-waveform-ghost', HTMLDivElement);

	#grabbed: Drawn | undefined;

	#isAsking = false;

	#isPinchSpent = false;

	#kindColours = new Map<string, string>();

	#paintedKey = '';

	#peaks: undefined | WaveformPeaks;

	#pending: Array<[number, number]> = [];

	#pendingListedMs = new Map<string, number>();

	#pinch: Pinch | undefined;

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

	readonly #touches = new Map<number, number>();

	#wheel: AbortController | undefined;

	override attributeChangedCallback(name: string): void {
		super.attributeChangedCallback(name);
		if (name === 'zoomable') this.#bindWheel();
	}

	override connectedCallback(): void {
		this.upgradeProperties(
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

	protected override connect(signal: AbortSignal): void {
		super.connect(signal);
		this.#connection = signal;
		signal.addEventListener(
			'abort',
			() => {
				this.#connection = undefined;
				this.#bindWheel();
			},
			{ once: true },
		);
		this.#bindWheel();
		this.#bindPinch(signal);
		this.bindGestures(this.control, signal, () => this.#grab());
		this.#bindZoomKeys(signal);
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

	protected paint(
		context: CanvasRenderingContext2D,
		{ frameMs, isDirty, isRebuilt, look, size }: SurfaceFrame<Colour>,
	): void {
		const held = this.#held();
		const isPaged = look.isReducedMotion && this.reducedMotion === 'page';
		const pending = this.#duePending();
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
			range: [this.min, Math.max(this.min, this.max)],
			size,
			zoom: this.zoom,
		});
		const { seconds, view } = timeline;

		this.#drawn = { seconds, startSeconds: view.startSeconds };
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
			this.#paintScene(context, { ...view, colours: look.colours }, isRebuilt);
			if (timeline.wanted) this.#ask(timeline.wanted);
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

	#ask(wanted: [number, number]): void {
		const key = wanted.join(':');
		if (key === this.#askedKey) return;

		let asked: ReturnType<PeaksRequest>;

		this.#askedKey = key;
		this.#isAsking = true;
		try {
			asked = this.#requestPeaks?.(...wanted);
		} finally {
			this.#isAsking = false;
		}

		const promises = asked instanceof Promise ? [asked] : (asked ?? []);

		for (const promise of promises) {
			if (this.#asked.has(promise)) continue;

			this.#asked.add(promise);
			void this.#repaintAfter(promise);
		}
	}

	#bindPinch(signal: AbortSignal): void {
		const control = this.control;

		this.#touches.clear();
		this.#pinch = undefined;
		this.#isPinchSpent = false;
		control.addEventListener(
			'pointerdown',
			(event) => {
				if (event.pointerType !== 'touch' || !this.zoomable || this.isDisabled()) return;

				this.#touches.set(event.pointerId, event.clientX);
				if (this.#pinch || this.#isPinchSpent) return;

				const pointerIds = this.#touchPair();
				if (!pointerIds) return;

				this.abandonHold();
				capturePointer(control, event.pointerId);
				this.#pinch = { pointerIds, startSpanPx: this.#spanPx(pointerIds), startZoom: this.zoom };
			},
			{ signal },
		);
		control.addEventListener(
			'pointermove',
			(event) => {
				if (!this.#touches.has(event.pointerId)) return;

				this.#touches.set(event.pointerId, event.clientX);

				const pinch = this.#pinch;
				if (!pinch?.pointerIds.includes(event.pointerId)) return;

				this.#zoomTo(
					pinch.startZoom * pinchFactor(pinch.startSpanPx, this.#spanPx(pinch.pointerIds)),
				);
			},
			{ signal },
		);
		for (const type of ['pointerup', 'pointercancel'] as const) {
			control.addEventListener(
				type,
				(event) => {
					if (!this.#touches.delete(event.pointerId)) return;

					if (this.#pinch?.pointerIds.includes(event.pointerId)) {
						this.#pinch = undefined;
						this.#isPinchSpent = true;
					}
					if (this.#touches.size === 0) this.#isPinchSpent = false;
				},
				{ signal },
			);
		}
	}

	#bindWheel(): void {
		this.#wheel?.abort();
		this.#wheel = undefined;
		if (!this.zoomable || !this.#connection) return;

		this.#wheel = new AbortController();
		// Chromium cannot cancel a wheel heard only on the `display: contents` host
		this.control.addEventListener(
			'wheel',
			(event) => {
				if ((!event.ctrlKey && !event.metaKey) || this.isDisabled()) return;

				event.preventDefault();
				this.#zoomTo(this.zoom * wheelFactor(event.deltaY, event.deltaMode));
			},
			{ passive: false, signal: this.#wheel.signal },
		);

		let startZoom = this.zoom;

		// Safari sends a trackpad pinch as gesture events, never as a ctrl wheel
		for (const type of ['gesturestart', 'gesturechange']) {
			this.control.addEventListener(
				type,
				(event) => {
					if (this.isDisabled() || this.#touches.size > 0) return;

					event.preventDefault();
					if (type === 'gesturestart') startZoom = this.zoom;
					else if ('scale' in event && typeof event.scale === 'number') {
						this.#zoomTo(startZoom * event.scale);
					}
				},
				{ signal: this.#wheel.signal },
			);
		}
	}

	#bindZoomKeys(signal: AbortSignal): void {
		this.control.addEventListener(
			'keydown',
			(event) => {
				const direction = this.#zoomKey(event);
				if (direction === undefined) return;

				event.preventDefault();
				this.#zoomTo(this.zoom * zoomKeyFactor ** direction);
			},
			{ signal },
		);
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
		if (this.#pinch || this.#isPinchSpent) return undefined;

		const drawn = this.#drawn ?? { seconds: this.value, startSeconds: this.value };

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
		const from = this.heldFrom();
		if (!grabbed || from === undefined) return undefined;

		return { grabbed, seconds: this.value === from ? grabbed.seconds : this.value };
	}

	#paintMarkers(context: CanvasRenderingContext2D, scene: Scene, isRebuilt: boolean): void {
		if (isRebuilt) this.#kindColours = this.#readKindColours();

		const line = Math.max(1, Math.round(scene.dpr));

		for (const { dimmed, kind, start } of this.markers) {
			const x = (start - scene.startSeconds) * scene.pixelsPerSecond;

			context.fillStyle =
				(isKind(kind) ? this.#kindColours.get(kind) : undefined) ?? scene.colours.marker;
			context.globalAlpha = dimmed === true ? 0.5 : 1;
			context.fillRect(x - line / 2, 0, line, scene.height);
		}
		context.globalAlpha = 1;
	}

	#paintScene(context: CanvasRenderingContext2D, scene: Scene, isRebuilt: boolean): void {
		const { dpr, height, pixelsPerSecond, startSeconds, width } = scene;
		const x = (seconds: number): number => (seconds - startSeconds) * pixelsPerSecond;
		const { ends, grid } = scene.colours;
		const line = Math.max(1, Math.round(dpr));
		const [opening, closing] = [x(this.min), x(Math.max(this.min, this.max))];
		const [from, to] = [clamp(opening, 0, width), clamp(closing, 0, width)];

		context.clearRect(0, 0, width, height);
		paintHatch(context, scene, [0, from]);
		paintHatch(context, scene, [to, width]);
		context.fillStyle = grid;
		if (to > from) context.fillRect(from, Math.round((height - line) / 2), to - from, line);
		paintPlaceholders(context, scene);
		if (this.#peaks) paintWave(context, scene, this.#peaks);
		// Scrolling lines sit at fractional x; rounding them judders
		context.fillStyle = ends;
		for (const edge of [opening, closing]) context.fillRect(edge - line / 2, 0, line, height);
		this.#paintMarkers(context, scene, isRebuilt);
	}

	#readKindColours(): Map<string, string> {
		const kinds = [...new Set(this.markers.map(({ kind }) => kind).filter((kind) => isKind(kind)))];
		const probes = kinds.map((kind) => {
			const probe = document.createElement('div');

			probe.className = 'sonic-waveform-label';
			writeKind(probe, kind, '--_sonic-waveform-marker');

			return probe;
		});

		this.control.append(...probes);

		const read = probes.map((probe) => getComputedStyle(probe).color);

		for (const probe of probes) probe.remove();

		return new Map(kinds.map((kind, index) => [kind, read[index] ?? '']));
	}

	// A write from inside the consumer's call repaints without asking for the same window again
	#repaint(): void {
		if (!this.#isAsking) this.#askedKey = undefined;
		this.surface()?.invalidate();
	}

	async #repaintAfter(asked: Promise<unknown>): Promise<void> {
		await Promise.allSettled([asked]);
		this.#repaint();
	}

	#sourceSeconds(): number {
		return this.#readTime?.() ?? this.playback();
	}

	#spanPx([first, second]: [number, number]): number {
		return (this.#touches.get(second) ?? 0) - (this.#touches.get(first) ?? 0);
	}

	#touchPair(): [number, number] | undefined {
		const [first, second, third] = this.#touches.keys();
		if (first === undefined || second === undefined || third !== undefined) return undefined;

		return [first, second];
	}

	#zoomKey(event: KeyboardEvent): number | undefined {
		if (!this.zoomable || this.isDisabled() || event.target !== this.control) return undefined;
		if (event.ctrlKey || event.metaKey || event.altKey) return undefined;

		return zoomKeys.get(event.key);
	}

	#zoomTo(target: number): void {
		const next = roundTo(clamp(target, this.zoomMin, this.zoomMax), 2);
		if (next === this.zoom) return;

		this.zoom = next;
		this.dispatchEvent(new Event('sonic-zoom', { bubbles: true }));
	}
}
