import type { BandLevels, LevelTable } from '#lib/band-levels.ts';
import type { TintCell, TintTable } from '#lib/wave-tint.ts';
import type { WaveformPeaks } from '#lib/waveform-buckets.ts';

import { highOverLow, levelTable } from '#lib/band-levels.ts';
import { balanceOf, energyReading, isLevelRange, onsetAt } from '#lib/wave-tint.ts';
import { foldRms, pairsIn, peaksFullScale } from '#lib/waveform-buckets.ts';

export interface WaveformBands extends BandLevels {
	framesPerSecond: number;
}

export interface BandTable extends LevelTable {
	framesPerSecond: number;
}

export interface TintSettings {
	cell: TintCell;
	/** How many decibels either side of the median reach an end of the palette */
	sensitivity: number;
	smoothingSeconds: number;
	table: TintTable;
}

interface TintView {
	pixelsPerSecond: number;
	startSeconds: number;
	width: number;
}

export interface TintSources {
	bands: BandTable | undefined;
	peaks: undefined | WaveformPeaks;
}

export interface TintStrip {
	base: Uint8ClampedArray<ArrayBuffer>;
	count: number;
	groupWidth: number;
	peaks: Uint8ClampedArray<ArrayBuffer>;
	x: number;
}

/** `missing` names a reference only when the data it belongs to is present */
export type TintReadiness =
	| { grid: TintGrid; isReady: true }
	| { isReady: false; missing: 'bands.medians' | 'peaks.rmsRange' | undefined };

interface TintGrid {
	unitCount: number;
	unitsPerSecond: number;
}

export function bandTable(bands: undefined | WaveformBands): BandTable | undefined {
	const table = levelTable(bands);
	if (!table || !bands || !(bands.framesPerSecond > 0)) return undefined;

	return { ...table, framesPerSecond: bands.framesPerSecond };
}

function framesIn(table: BandTable): number {
	return Math.floor(table.levels.length / table.bandCount);
}

function hasBalanceBands(bands: LevelTable | undefined): bands is LevelTable {
	return bands !== undefined && bands.bandCount >= 2;
}

function missingReference(
	cell: TintCell,
	{ bands, peaks }: TintSources,
): 'bands.medians' | 'peaks.rmsRange' | undefined {
	if (cell.hue && hasBalanceBands(bands) && !bands.medians) return 'bands.medians';
	if (cell.dynamics === 'energy' && peaks?.rms && !isLevelRange(peaks.rmsRange)) {
		return 'peaks.rmsRange';
	}

	return undefined;
}

function gridOf(cell: TintCell, { bands, peaks }: TintSources): TintGrid | undefined {
	if (cell.hue !== undefined || cell.dynamics === 'onsets') {
		if (!bands || (cell.hue && !hasBalanceBands(bands))) return undefined;

		return { unitCount: framesIn(bands), unitsPerSecond: bands.framesPerSecond };
	}
	if (!peaks) return undefined;

	return { unitCount: pairsIn(peaks), unitsPerSecond: peaks.pairsPerSecond };
}

export function tintReadiness(cell: TintCell, sources: TintSources): TintReadiness {
	const missing = missingReference(cell, sources);
	if (missing) return { isReady: false, missing };

	const { peaks } = sources;
	if (cell.dynamics === 'energy' && !(peaks?.rms && peaks.pairsPerSecond > 0)) {
		return { isReady: false, missing: undefined };
	}

	const grid = gridOf(cell, sources);

	return grid ? { grid, isReady: true } : { isReady: false, missing: undefined };
}

function balanceSums(table: BandTable, [from, to]: [number, number]): Float64Array {
	const sums = new Float64Array(to - from + 1);

	for (let frame = from; frame < to; frame += 1) {
		sums[frame - from + 1] = (sums[frame - from] ?? 0) + highOverLow(table, frame);
	}

	return sums;
}

function meanOnset(table: BandTable, [from, to]: [number, number]): number {
	const { bandCount, decibelsOf, levels } = table;
	const decibels = (frame: number, band: number): number =>
		decibelsOf(levels[frame * bandCount + band] ?? 0);
	let total = 0;

	for (let frame = from; frame < to; frame += 1) total += onsetAt(decibels, [frame, bandCount]);

	return to > from ? total / (to - from) : 0;
}

function groupEnergy(
	peaks: undefined | WaveformPeaks,
	[fromSeconds, toSeconds]: [number, number],
): number {
	if (!peaks?.rmsRange || !(peaks.pairsPerSecond > 0)) return 0;

	const rms = foldRms(
		peaks,
		Math.floor(fromSeconds * peaks.pairsPerSecond),
		Math.max(
			Math.floor(fromSeconds * peaks.pairsPerSecond) + 1,
			Math.ceil(toSeconds * peaks.pairsPerSecond),
		),
	);

	return energyReading((rms ?? 0) * peaksFullScale(peaks), peaks.rmsRange);
}

function dynamicsOf(
	{ dynamics }: TintCell,
	{ bands, peaks }: TintSources,
	[fromUnit, toUnit, unitsPerSecond]: [number, number, number],
): number {
	if (dynamics === 'onsets') return bands ? meanOnset(bands, [fromUnit, toUnit]) : 0;
	if (dynamics !== 'energy') return 0;

	return groupEnergy(peaks, [fromUnit / unitsPerSecond, toUnit / unitsPerSecond]);
}

function copyColour(
	pixels: Uint8ClampedArray,
	index: number,
	[colours, entry]: [Uint8Array, number],
): void {
	pixels[index * 4] = colours[entry * 3] ?? 0;
	pixels[index * 4 + 1] = colours[entry * 3 + 1] ?? 0;
	pixels[index * 4 + 2] = colours[entry * 3 + 2] ?? 0;
	pixels[index * 4 + 3] = 255;
}

interface GroupSpan {
	first: number;
	last: number;
	perGroup: number;
}

function spanOf(grid: TintGrid, view: TintView): GroupSpan & { groupWidth: number; x: number } {
	const pxPerUnit = view.pixelsPerSecond / grid.unitsPerSecond;
	const perGroup = Math.max(1, Math.round(1 / pxPerUnit));
	const openingUnit = view.startSeconds * grid.unitsPerSecond;
	const groupsTotal = Math.ceil(grid.unitCount / perGroup);
	// A group past each end, so the smoothing at the image's own edges falls outside the window
	const first = Math.max(0, Math.floor(openingUnit / perGroup) - 1);
	const last = Math.min(
		groupsTotal,
		Math.ceil((openingUnit + view.width / pxPerUnit) / perGroup) + 1,
	);

	return {
		first,
		groupWidth: perGroup * pxPerUnit,
		last,
		perGroup,
		x: (first * perGroup - openingUnit) * pxPerUnit,
	};
}

// The balance is averaged over a fixed time rather than a fixed number of groups, so it looks the same at every zoom
function balanceReader(
	bands: BandTable | undefined,
	[cell, settings]: [TintCell, TintSettings],
	[span, grid]: [GroupSpan, TintGrid],
): (fromUnit: number, toUnit: number) => number {
	if (!bands || !cell.hue) return () => 0.5;

	const reach = Math.floor((settings.smoothingSeconds * grid.unitsPerSecond) / 2);
	const [start, end] = [
		Math.max(0, span.first * span.perGroup - reach),
		Math.min(grid.unitCount, span.last * span.perGroup + reach),
	];
	const sums = balanceSums(bands, [start, end]);

	return (fromUnit, toUnit) => {
		const from = Math.max(start, fromUnit - reach);
		const to = Math.max(from + 1, Math.min(end, toUnit + reach));
		const total = (sums[to - start] ?? 0) - (sums[from - start] ?? 0);

		return balanceOf(total / (to - from), settings.sensitivity);
	};
}

// Keyed to absolute frames, as buckets are to pairs; keyed to the window, the colours shimmer as it scrolls
export function tintStrip(
	sources: TintSources,
	settings: TintSettings,
	view: TintView,
): TintStrip | undefined {
	const { cell, table } = settings;
	if (view.pixelsPerSecond <= 0) return undefined;

	const readiness = tintReadiness(cell, sources);
	if (!readiness.isReady) return undefined;

	const { grid } = readiness;
	const span = spanOf(grid, view);
	const count = span.last - span.first;
	if (count < 1) return undefined;

	const balanceOver = balanceReader(sources.bands, [cell, settings], [span, grid]);
	const base = new Uint8ClampedArray(count * 4);
	const peaksPixels = new Uint8ClampedArray(count * 4);

	for (let index = 0; index < count; index += 1) {
		const fromUnit = (span.first + index) * span.perGroup;
		const toUnit = Math.min(grid.unitCount, fromUnit + span.perGroup);
		const reading = {
			balance: balanceOver(fromUnit, toUnit),
			dynamics: dynamicsOf(cell, sources, [fromUnit, toUnit, grid.unitsPerSecond]),
		};
		const entry = table.indexOf(reading);

		copyColour(base, index, [table.base, entry]);
		copyColour(peaksPixels, index, [table.peaks, entry]);
	}

	return { base, count, groupWidth: span.groupWidth, peaks: peaksPixels, x: span.x };
}
