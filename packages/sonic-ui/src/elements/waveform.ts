import type { RangeAxis } from '#elements/range-element.ts';
import type { SurfaceFrame, SurfaceLook } from '#lib/canvas-surface.ts';
import type { Drawn, View } from '#lib/frame-timeline.ts';
import type { TimeSpans } from '#lib/time-spans.ts';
import type { WaveformData } from '#lib/waveform-buckets.ts';

import { SonicWaveElement } from '#elements/wave-element.ts';
import { frameTimeline } from '#lib/frame-timeline.ts';
import { createLabelRider } from '#lib/marker-rider.ts';
import { clamp } from '#lib/math.ts';
import { requireChild, template } from '#lib/render.ts';
import { readSpans } from '#lib/time-spans.ts';
import { createTrackingClock } from '#lib/tracking-clock.ts';
import { waveformBuckets } from '#lib/waveform-buckets.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-waveform': SonicWaveform;
	}
}

type Colour = keyof typeof colours;

interface Scene extends View {
	colours: SurfaceLook<Colour>['colours'];
}

const colours = {
	grid: '--_sonic-waveform-grid',
	hatch: '--_sonic-waveform-hatch',
	marker: '--_sonic-waveform-marker',
	wave: '--_sonic-waveform-wave',
	waveEdge: '--_sonic-waveform-wave-edge',
} as const;

const defaultZoom = 70;

const amplitudeMargin = 0.94;

const hatchPitchPx = 8;
const placeholderWavelengthPx = 48;
const placeholderAmplitude = 0.2;

const renderWaveform = template(
	/* HTML */ `
		<div class="sonic-waveform" role="slider" tabindex="0">
			<canvas class="sonic-waveform-canvas" aria-hidden="true"></canvas>
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
	context.strokeStyle = scene.colours.hatch;
	context.stroke();
	context.restore();
}

function paintPlaceholders(context: CanvasRenderingContext2D, scene: Scene): void {
	if (scene.pending.length === 0) return;

	const { dpr, height, pixelsPerSecond, startSeconds } = scene;
	const wavelength = placeholderWavelengthPx * dpr;
	const centre = height / 2;
	const origin = startSeconds * pixelsPerSecond;
	const waveY = (x: number): number =>
		centre -
		Math.sin(((x + origin) / wavelength + scene.phase) * 2 * Math.PI) *
			centre *
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
	context.strokeStyle = scene.colours.hatch;
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

function paintWave(context: CanvasRenderingContext2D, scene: Scene, data: WaveformData): void {
	const buckets = waveformBuckets(data, scene);
	const [first] = buckets;
	if (!first) return;

	const centre = scene.height / 2;
	const scale = centre * amplitudeMargin;

	context.fillStyle = waveFill(context, scene);
	context.beginPath();
	context.moveTo(first.x, centre);
	for (const bucket of buckets) context.lineTo(bucket.x, centre - bucket.high * scale);
	for (const bucket of buckets.toReversed()) context.lineTo(bucket.x, centre - bucket.low * scale);
	context.closePath();
	context.fill();
}

export class SonicWaveform extends SonicWaveElement<Colour> {
	static override readonly observedAttributes = [
		...SonicWaveElement.observedAttributes,
		'playing',
		'rate',
		'zoom',
	];

	get data(): undefined | WaveformData {
		return this.#data;
	}

	set data(data: undefined | WaveformData) {
		this.#data = data;
		this.renderEmpty();
		this.surface()?.invalidate();
	}

	get pending(): Array<[number, number]> {
		return this.#pending.map(([start, end]) => [start, end]);
	}

	set pending(spans: TimeSpans | undefined) {
		this.#pending = spans ? readSpans(spans) : [];
		this.surface()?.invalidate();
	}

	get playing(): boolean {
		return this.hasAttribute('playing');
	}

	set playing(isPlaying: boolean) {
		this.reflect('playing', isPlaying);
	}

	get rate(): number {
		const rate = this.numberAttribute('rate', 1);

		return rate > 0 ? rate : 1;
	}

	set rate(value: number | undefined) {
		this.reflect('rate', value);
	}

	get readTime(): (() => number | undefined) | undefined {
		return this.#readTime;
	}

	set readTime(read: (() => number | undefined) | undefined) {
		this.#readTime = read;
		this.render();
	}

	get requestSpan(): ((fromSeconds: number, toSeconds: number) => void) | undefined {
		return this.#requestSpan;
	}

	set requestSpan(request: ((fromSeconds: number, toSeconds: number) => void) | undefined) {
		this.#requestSpan = request;
		this.surface()?.invalidate();
	}

	get zoom(): number {
		const zoom = this.numberAttribute('zoom', defaultZoom);

		return zoom > 0 ? zoom : defaultZoom;
	}

	set zoom(value: number | undefined) {
		this.reflect('zoom', value);
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

	readonly #clock = createTrackingClock();

	#data: undefined | WaveformData;

	#drawn: Drawn | undefined;

	readonly #ghost = requireChild(this.control, '.sonic-waveform-ghost', HTMLDivElement);

	#grabbed: Drawn | undefined;

	#paintedKey = '';

	#pending: Array<[number, number]> = [];

	readonly #playhead = requireChild(this.control, '.sonic-waveform-playhead', HTMLDivElement);

	#readTime: (() => number | undefined) | undefined;

	#requestSpan: ((fromSeconds: number, toSeconds: number) => void) | undefined;

	readonly #rider = createLabelRider(this.control, {
		className: 'sonic-waveform-label',
		insetProperty: '--_sonic-waveform-label-inset',
	});

	override connectedCallback(): void {
		this.upgradeProperties('data', 'pending', 'playing', 'rate', 'readTime', 'requestSpan', 'zoom');
		super.connectedCallback();
	}

	protected override connect(signal: AbortSignal): void {
		super.connect(signal);
		this.bindGestures(this.control, signal, () => this.#grab());
		document.fonts.addEventListener(
			'loadingdone',
			() => {
				this.renderMarkers();
			},
			{ signal },
		);
	}

	protected draw(): void {
		this.surface()?.requestFrame();
	}

	protected isEmpty(): boolean {
		return !this.#data || this.#data.samples.length === 0;
	}

	protected paint(
		context: CanvasRenderingContext2D,
		{ frameMs, isDirty, look, size }: SurfaceFrame<Colour>,
	): void {
		const held = this.#held();
		const timeline = frameTimeline({
			clockSeconds: this.#clock.read(frameMs, {
				isPlaying: this.playing,
				rate: this.rate,
				seconds: this.#sourceSeconds(),
			}),
			frameMs,
			...(held ? { held } : {}),
			isPaged: look.isReducedMotion,
			isPlaying: this.playing,
			pending: this.#pending,
			range: [this.min, Math.max(this.min, this.max)],
			size,
			zoom: this.zoom,
		});
		const { seconds, view } = timeline;

		this.#drawn = { seconds, startSeconds: view.startSeconds };
		placeLine(this.#playhead, timeline.playheadAt);
		placeLine(this.#ghost, timeline.ghostAt);
		this.toggleState('pending', view.pending.length > 0);
		this.#rider.place({
			playheadSeconds: seconds,
			startSeconds: view.startSeconds,
			widthPx: view.width / view.dpr,
			windowSeconds: view.width / view.pixelsPerSecond,
		});
		if (isDirty || timeline.paintKey !== this.#paintedKey) {
			this.#paintedKey = timeline.paintKey;
			this.#paintScene(context, { ...view, colours: look.colours });
			if (timeline.wanted) this.#requestSpan?.(...timeline.wanted);
		}
		if (timeline.isMoving) this.surface()?.requestFrame();
	}

	protected override renderMarkers(): void {
		const bounds = this.scale().bounds;

		this.#rider.measure(
			this.markers.flatMap(({ dimmed, label, value }) =>
				label === undefined || label === ''
					? []
					: [{ isDimmed: dimmed === true, text: label, value: clamp(value, ...bounds) }],
			),
		);
		this.surface()?.invalidate();
	}

	#grab(): RangeAxis {
		const drawn = this.#drawn ?? { seconds: this.value, startSeconds: this.value };

		this.#grabbed = drawn;

		const scale = this.scale();
		const [low, high] = scale.bounds;

		return {
			fromPlace: scale.place(drawn.seconds),
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

	#paintScene(context: CanvasRenderingContext2D, scene: Scene): void {
		const { dpr, height, pixelsPerSecond, startSeconds, width } = scene;
		const x = (seconds: number): number => (seconds - startSeconds) * pixelsPerSecond;
		const { grid, marker } = scene.colours;
		const line = Math.max(1, Math.round(dpr));
		const [opening, closing] = [x(this.min), x(Math.max(this.min, this.max))];
		const [from, to] = [clamp(opening, 0, width), clamp(closing, 0, width)];

		context.clearRect(0, 0, width, height);
		paintHatch(context, scene, [0, from]);
		paintHatch(context, scene, [to, width]);
		context.fillStyle = grid;
		if (to > from) context.fillRect(from, Math.round((height - line) / 2), to - from, line);
		paintPlaceholders(context, scene);
		if (this.#data) paintWave(context, scene, this.#data);
		// Scrolling lines sit at fractional x; rounding them judders
		context.fillStyle = grid;
		for (const edge of [opening, closing]) context.fillRect(edge - line / 2, 0, line, height);
		context.fillStyle = marker;
		for (const marker of this.markers) {
			context.globalAlpha = marker.dimmed === true ? 0.5 : 1;
			context.fillRect(x(marker.value) - line / 2, 0, line, height);
		}
		context.globalAlpha = 1;
	}

	#sourceSeconds(): number {
		return this.#readTime?.() ?? this.playback();
	}
}
