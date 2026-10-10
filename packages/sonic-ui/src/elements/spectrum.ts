import type { SurfaceFrame, SurfaceLook, SurfaceSize } from '#lib/canvas-surface.ts';
import type { FrequencyAxis } from '#lib/spectrum-columns.ts';

import { SonicAnalyserElement } from '#elements/analyser-element.ts';
import { requireChild, template } from '#lib/render.ts';
import {
	columnEdges,
	columnLevels,
	gridColumns,
	gridRows,
	levelRows,
	loudestBin,
	zoneRows,
} from '#lib/spectrum-columns.ts';
import { areSettled, createLevels, receiveLevels, stepLevels } from '#lib/spectrum-levels.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-spectrum': SonicSpectrum;
	}
}

type Colour = keyof typeof colours;

type Numeric = keyof typeof numbers;

type Look = SurfaceLook<Colour, never, Numeric>;

interface SpectrumPeak {
	decibels: number;
	frequency: number;
}

interface Scene extends SurfaceSize {
	look: Look;
	range: { max: number; min: number };
	rowOf: (level: number) => number;
}

interface Columns {
	bars: Float64Array;
	edges: Float64Array;
	holds: Float64Array;
	key: string;
}

const colours = {
	clip: '--_sonic-spectrum-clip',
	grid: '--_sonic-spectrum-grid',
	hot: '--_sonic-spectrum-hot',
	lit: '--_sonic-spectrum-lit',
} as const;

const numbers = {
	clipFrom: '--_sonic-spectrum-clip-from',
	hotFrom: '--_sonic-spectrum-hot-from',
} as const;

const defaultFrequencies: [number, number] = [20, 20_000];
const defaultSampleRate = 48_000;

const renderSpectrum = template(
	/* HTML */ `
		<div aria-hidden="true" class="sonic-spectrum">
			<canvas class="sonic-spectrum-canvas"></canvas>
		</div>
	`,
	HTMLDivElement,
);

// One path, since a crossing filled twice would show brighter than its lines
function paintGrid(
	context: CanvasRenderingContext2D,
	{ dpr, height, look, range, rowOf, width }: Scene,
	[frequencyMin, frequencyMax]: [number, number],
): void {
	const line = Math.max(1, Math.round(dpr));
	const columns = gridColumns({ frequencyMax, frequencyMin }, width);
	const rows = gridRows(range, rowOf);

	context.beginPath();
	for (const column of columns) context.rect(column, 0, line, height);
	for (const row of rows) context.rect(0, row, width, line);
	context.fillStyle = look.colours.grid;
	context.fill();
}

function zoneFill(
	context: CanvasRenderingContext2D,
	{ height, look, rowOf }: Scene,
): CanvasGradient {
	const gradient = context.createLinearGradient(0, 0, 0, height);
	const { clip, hot } = zoneRows(look.numbers, rowOf);

	gradient.addColorStop(clip / height, look.colours.clip);
	gradient.addColorStop(clip / height, look.colours.hot);
	gradient.addColorStop(hot / height, look.colours.hot);
	gradient.addColorStop(hot / height, look.colours.lit);

	return gradient;
}

// Whole device pixels, so nothing is antialiased
function paintBars(context: CanvasRenderingContext2D, scene: Scene, bars: Float64Array): void {
	const { height, rowOf } = scene;
	let previous = height;

	context.beginPath();
	context.moveTo(0, height);
	for (const [column, level] of bars.entries()) {
		const row = rowOf(level);

		bars[column] = row;
		if (row === previous) continue;

		context.lineTo(column, previous);
		context.lineTo(column, row);
		previous = row;
	}
	context.lineTo(bars.length, previous);
	context.lineTo(bars.length, height);
	context.closePath();
	context.fillStyle = zoneFill(context, scene);
	context.fill();
}

function paintHolds(
	context: CanvasRenderingContext2D,
	{ look, rowOf }: Scene,
	{ bars, holds }: { bars: Float64Array; holds: Float64Array },
): void {
	context.beginPath();
	for (const [column, level] of holds.entries()) {
		const row = rowOf(level);

		if (row < (bars[column] ?? 0)) context.rect(column, row, 1, 1);
	}
	context.fillStyle = look.colours.lit;
	context.fill();
}

export class SonicSpectrum extends SonicAnalyserElement<Colour, Numeric> {
	static override readonly observedAttributes = [
		...SonicAnalyserElement.observedAttributes,
		'frequency-max',
		'frequency-min',
		'grid',
		'peak-hold',
		'sample-rate',
	];

	get frequencyMax(): number {
		return this.numberAttribute('frequency-max', defaultFrequencies[1]);
	}

	set frequencyMax(hertz: number | undefined) {
		this.reflect('frequency-max', hertz);
	}

	get frequencyMin(): number {
		return this.numberAttribute('frequency-min', defaultFrequencies[0]);
	}

	set frequencyMin(hertz: number | undefined) {
		this.reflect('frequency-min', hertz);
	}

	get grid(): 'none' | 'on' {
		return this.getAttribute('grid') === 'none' ? 'none' : 'on';
	}

	set grid(grid: 'none' | 'on' | undefined) {
		this.reflect('grid', grid);
	}

	get peak(): SpectrumPeak | undefined {
		return this.#peak && { ...this.#peak };
	}

	get peakHold(): boolean {
		return this.hasAttribute('peak-hold');
	}

	set peakHold(isHeld: boolean) {
		this.reflect('peak-hold', isHeld);
	}

	get sampleRate(): number {
		const sampleRate = this.numberAttribute('sample-rate', defaultSampleRate);

		return sampleRate > 0 ? sampleRate : defaultSampleRate;
	}

	set sampleRate(hertz: number | undefined) {
		this.reflect('sample-rate', hertz);
	}

	protected override readonly control = renderSpectrum();

	protected readonly canvas = requireChild(
		this.control,
		'.sonic-spectrum-canvas',
		HTMLCanvasElement,
	);

	protected readonly colours = colours;

	protected readonly numbers = numbers;

	protected override readonly sheet = 'spectrum.css';

	protected readonly sizeProperty = '--_sonic-spectrum-size';

	#columns: Columns | undefined;

	#isSettled = true;

	#lastFrameMs: number | undefined;

	#levels = createLevels(0);

	#peak: SpectrumPeak | undefined;

	#receivedRate: number | undefined;

	override connectedCallback(): void {
		this.upgradeProperties('frequencyMax', 'frequencyMin', 'grid', 'peakHold', 'sampleRate');
		super.connectedCallback();
	}

	resetPeak(): void {
		this.#peak = undefined;
	}

	protected paint(
		context: CanvasRenderingContext2D,
		{ frameMs, isDirty, look, size }: SurfaceFrame<Colour, never, Numeric>,
	): void {
		if (this.isDisabled()) {
			if (isDirty) this.#draw(context, look, size);
			return;
		}

		const wasSettled = this.#isSettled;

		this.#step(frameMs, look.isReducedMotion);
		if (isDirty || !wasSettled || !this.#isSettled) this.#draw(context, look, size);
		if (!this.#isSettled) this.surface()?.requestFrame();
	}

	protected pull(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): void {
		analyser.getFloatFrequencyData(buffer);
	}

	protected receive(frame: Float32Array): void {
		if (frame.length !== this.#levels.bars.length) this.#levels = createLevels(frame.length);
		this.#receivedRate = this.analyser?.context.sampleRate ?? this.sampleRate;
		receiveLevels(this.#levels, frame, this.min);

		const loudest = loudestBin(frame, this.#axis());

		if (loudest && loudest.decibels > (this.#peak?.decibels ?? -Infinity)) this.#peak = loudest;
	}

	#axis(): FrequencyAxis {
		const [frequencyMin, frequencyMax] = this.#frequencies();

		return {
			binCount: this.#levels.bars.length,
			frequencyMax,
			frequencyMin,
			// The bars on show keep the rate they arrived at once the analyser is unset
			sampleRate: this.#receivedRate ?? this.sampleRate,
		};
	}

	#columnsFor(width: number): Columns {
		const axis = this.#axis();
		const key = [width, axis.binCount, axis.sampleRate, axis.frequencyMin, axis.frequencyMax].join(
			' ',
		);

		if (this.#columns?.key !== key) {
			this.#columns = {
				bars: new Float64Array(width),
				edges: columnEdges(axis, width),
				holds: new Float64Array(width),
				key,
			};
		}

		return this.#columns;
	}

	#draw(context: CanvasRenderingContext2D, look: Look, size: SurfaceSize): void {
		const scene = {
			...size,
			look,
			range: { max: this.max, min: this.min },
			rowOf: levelRows({ max: this.max, min: this.min }, size.height),
		};

		context.clearRect(0, 0, size.width, size.height);
		if (this.grid === 'on') paintGrid(context, scene, this.#frequencies());
		if (this.isDisabled()) return;

		const { bars, edges, holds } = this.#columnsFor(size.width);
		const spread = { edges, floor: scene.range.min };

		columnLevels(bars, this.#levels.bars, spread);
		paintBars(context, scene, bars);
		if (!this.peakHold) return;

		columnLevels(holds, this.#levels.holds, spread);
		paintHolds(context, scene, { bars, holds });
	}

	#frequencies(): [number, number] {
		const { frequencyMax, frequencyMin } = this;

		return frequencyMin > 0 && frequencyMax > frequencyMin
			? [frequencyMin, frequencyMax]
			: defaultFrequencies;
	}

	#step(frameMs: number, isReducedMotion: boolean): void {
		const floor = this.min;

		stepLevels(this.#levels, {
			elapsedMs: Math.max(0, frameMs - (this.#lastFrameMs ?? frameMs)),
			floor,
			isHeld: this.peakHold,
			isHoldStepped: isReducedMotion,
			nowMs: frameMs,
		});
		this.#isSettled = areSettled(this.#levels, floor);
		this.#lastFrameMs = this.#isSettled ? undefined : frameMs;
	}
}
