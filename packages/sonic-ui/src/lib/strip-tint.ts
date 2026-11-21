import type { LevelTable } from '#lib/band-levels.ts';
import type { Oklch } from '#lib/oklch.ts';
import type { TintCell, TintPalette } from '#lib/wave-tint.ts';

import { highOverLow } from '#lib/band-levels.ts';
import { balanceOf, energyReading, isLevelRange, zoneColours } from '#lib/wave-tint.ts';

export interface StripTintSources {
	bands: LevelTable | undefined;
	peaks: ArrayLike<number> | undefined;
	peaksRange: readonly [number, number] | undefined;
}

export type StripTintReadiness =
	| { cell: TintCell; isReady: true }
	| { isReady: false; missing: 'bands.medians' | 'peaksRange' | undefined };

// A bar averages several seconds of audio, so onsets mean nothing on the strip
function stripCell(cell: TintCell | undefined): TintCell | undefined {
	if (!cell) return undefined;
	if (cell.hue) return cell.dynamics === 'energy' ? cell : { hue: cell.hue };

	return cell.dynamics === 'energy' ? cell : undefined;
}

function hasBalanceBands(bands: LevelTable | undefined): bands is LevelTable {
	return bands !== undefined && bands.bandCount >= 2 && bands.levels.length >= bands.bandCount;
}

function hasPeaks(peaks: ArrayLike<number> | undefined): peaks is ArrayLike<number> {
	return peaks !== undefined && peaks.length > 0;
}

function missingReference(
	cell: TintCell,
	{ bands, peaks, peaksRange }: StripTintSources,
): 'bands.medians' | 'peaksRange' | undefined {
	if (cell.hue && hasBalanceBands(bands) && !bands.medians) return 'bands.medians';
	if (cell.dynamics && hasPeaks(peaks) && !isLevelRange(peaksRange)) return 'peaksRange';

	return undefined;
}

export function stripTintReadiness(
	requested: TintCell | undefined,
	sources: StripTintSources,
): StripTintReadiness {
	const cell = stripCell(requested);
	if (!cell) return { isReady: false, missing: undefined };

	const missing = missingReference(cell, sources);
	if (missing) return { isReady: false, missing };

	const isMissingData =
		(cell.hue !== undefined && !hasBalanceBands(sources.bands)) ||
		(cell.dynamics !== undefined && !hasPeaks(sources.peaks));

	return isMissingData ? { isReady: false, missing: undefined } : { cell, isReady: true };
}

// The same slices `resamplePeaks` draws a bar from, so a bar's colour sits on its own bar
function slicesOf(length: number, bar: number, count: number): [number, number] {
	if (count > length) {
		const nearest = count === 1 ? 0 : Math.round((bar * (length - 1)) / (count - 1));

		return [nearest, nearest + 1];
	}

	const start = Math.floor((bar * length) / count);

	return [start, Math.max(start + 1, Math.floor(((bar + 1) * length) / count))];
}

function meanBalance(bands: LevelTable, [from, to]: [number, number], sensitivity: number): number {
	let total = 0;

	for (let row = from; row < to; row += 1) total += highOverLow(bands, row);

	return balanceOf(total / (to - from), sensitivity);
}

function meanPeak(peaks: ArrayLike<number>, [from, to]: [number, number]): number {
	let total = 0;

	for (let index = from; index < to; index += 1) total += peaks[index] ?? 0;

	return total / (to - from);
}

/** One colour per bar, with `bands` and `peaks` each covering the whole track and stretched to fit the bars */
export function stripTints(
	cell: TintCell,
	sources: StripTintSources,
	[palette, sensitivity, count]: [TintPalette, number, number],
): Array<Oklch> {
	const { bands, peaks, peaksRange } = sources;
	if (palette.stops.length === 0 || count < 1) return [];

	const rows = bands ? Math.floor(bands.levels.length / bands.bandCount) : 0;
	const balanceAt = (bar: number): number =>
		bands && cell.hue ? meanBalance(bands, slicesOf(rows, bar, count), sensitivity) : 0.5;
	const dynamicsAt = (bar: number): number =>
		peaks && peaksRange && cell.dynamics
			? energyReading(meanPeak(peaks, slicesOf(peaks.length, bar, count)), peaksRange)
			: 0;

	return Array.from(
		{ length: count },
		(_tint, bar) =>
			zoneColours(cell, { balance: balanceAt(bar), dynamics: dynamicsAt(bar) }, palette).base,
	);
}
