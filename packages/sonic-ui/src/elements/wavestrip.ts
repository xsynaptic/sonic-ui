import type { ValueAxis } from '#elements/value-gestures.ts';
import type { SurfaceFrame } from '#lib/canvas-surface.ts';
import type { StripRegions } from '#lib/strip-scene.ts';
import type { TimeRegions } from '#lib/time-regions.ts';

import { SonicWaveElement } from '#elements/wave-element.ts';
import { createMarkerBand } from '#lib/marker-band.ts';
import { clampProportion } from '#lib/math.ts';
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
		<div class="sonic-wavestrip" role="slider" tabindex="0">
			<canvas class="sonic-wavestrip-canvas" aria-hidden="true"></canvas>
			<div class="sonic-wavestrip-markers" aria-hidden="true"></div>
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

	get peaks(): ArrayLike<number> | undefined {
		return this.#peaks;
	}

	set peaks(peaks: ArrayLike<number> | undefined) {
		this.#peaks = peaks;
		this.renderEmpty();
		this.surface()?.invalidate();
	}

	protected readonly control = renderWavestrip();

	protected readonly canvas = requireChild(
		this.control,
		'.sonic-wavestrip-canvas',
		HTMLCanvasElement,
	);

	protected readonly colours = colours;

	protected readonly lengths = lengths;

	protected readonly sheet = 'wavestrip.css';

	protected readonly sizeProperty = '--_sonic-wavestrip-size';

	#bars: Path2D | undefined;

	#buffered: Array<[number, number]> = [];

	readonly #markerBand = createMarkerBand(
		requireChild(this.control, '.sonic-wavestrip-markers', HTMLDivElement),
	);

	#paintedKey = '';

	#peaks: ArrayLike<number> | undefined;

	clientXOf(value: number): number {
		const { startPx, travelPx } = this.#axis();

		return startPx + this.mapping().proportionOf(value) * travelPx;
	}

	override connectedCallback(): void {
		this.upgradeProperties('buffered', 'cancellable', 'peaks');
		super.connectedCallback();
	}

	protected override connect(signal: AbortSignal): void {
		const { control } = this;

		super.connect(signal);
		this.bindHover(control, signal, {
			place: () => {
				this.#placeReadout();
			},
			valueAt: (event) => {
				const axis = this.#axis();
				const at = clampProportion((event.clientX - axis.startPx) / axis.travelPx);
				const mapping = this.mapping();

				return this.#markerAt(event, axis) ?? mapping.snap(mapping.valueAt(at));
			},
		});
		this.bindGestures(control, signal, (event) => this.#grab(event));
	}

	protected draw(): void {
		const surface = this.surface();

		this.#placeReadout();
		this.showCurrentMarker(this.scrubState().played);
		if (surface && this.#stripRegions(surface.size.width).key !== this.#paintedKey) {
			surface.requestFrame();
		}
	}

	protected isEmpty(): boolean {
		return !this.#peaks || this.#peaks.length === 0;
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
		this.#markerBand.render(this.markerList(), this.markerProportions());
	}

	protected override scrubsKeyRepeat(): boolean {
		return true;
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

	#grab(event: PointerEvent): ValueAxis {
		const axis = this.#axis();
		const at = (event.clientX - axis.startPx) / axis.travelPx;
		const outside = this.#outside();
		const grabbed = {
			fromProportion: clampProportion(at),
			position: axis.position,
			travelPx: axis.travelPx,
		};

		this.input(this.#markerAt(event, axis) ?? this.mapping().valueAt(at));

		return outside ? { ...grabbed, outside } : grabbed;
	}

	#markerAt(
		event: PointerEvent,
		{ startPx, topPx, travelPx }: { startPx: number; topPx: number; travelPx: number },
	): number | undefined {
		const index = this.#markerBand.at(
			{ x: event.clientX - startPx, y: event.clientY - topPx },
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
		const { played, scrub } = scrubRegions(this.scrubState(), this.value, mapping);

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
