import type { Oklch } from '#lib/oklch.ts';

import { clampProportion } from '#lib/math.ts';
import { blendOklch, rgbOf } from '#lib/oklch.ts';

export const tintHues = ['spectral'] as const;

export const tintDynamics = ['energy', 'onsets'] as const;

export type TintHue = (typeof tintHues)[number];

export type TintDynamics = (typeof tintDynamics)[number];

/** A tint reads at least one of the two */
export type TintCell =
	{ dynamics: TintDynamics; hue?: undefined } | { dynamics?: TintDynamics; hue: TintHue };

export interface TintPalette {
	/** The share of the distance to the surface's lightness that the peaks zone moves, from 0 to 1 */
	peaksDepth: number;
	/** Fewer than 2 steps leaves the palette continuous */
	steps: number;
	/** Ordered from the bass end */
	stops: ReadonlyArray<Oklch>;
	surfaceLightness: number;
}

/** Both readings run from 0 to 1, and a cell ignores the one it does not use */
export interface TintReading {
	balance: number;
	dynamics: number;
}

export interface ZoneColours {
	base: Oklch;
	peaks: Oklch;
}

const restPosition = 0.15;
const onsetReach = 0.85;

const energyFloor = 0.55;
const onsetFloor = 0.68;
const onsetCeiling = 1.08;

// Without a limit, a silent band would pull a column to one end of the palette
export const relativeLimit = 24;

const fullOnsetDecibels = 12;

export const onsetLookback = 4;

export function tintCellOf(
	hue: TintHue | undefined,
	dynamics: TintDynamics | undefined,
): TintCell | undefined {
	if (hue) return dynamics ? { dynamics, hue } : { hue };

	return dynamics ? { dynamics } : undefined;
}

export function parseTintHue(value: null | string): TintHue | undefined {
	return tintHues.find((hue) => hue === value);
}

export function parseTintDynamics(value: null | string): TintDynamics | undefined {
	return tintDynamics.find((dynamics) => dynamics === value);
}

export function steppedPosition(position: number, steps: number): number {
	const clamped = clampProportion(position);
	if (!(steps >= 2)) return clamped;

	const count = Math.round(steps);

	return Math.min(count - 1, Math.floor(clamped * count)) / (count - 1);
}

export function samplePalette(stops: ReadonlyArray<Oklch>, position: number): Oklch {
	const scaled = clampProportion(position) * Math.max(0, stops.length - 1);
	const index = Math.max(0, Math.min(stops.length - 2, Math.floor(scaled)));
	const from = stops[index] ?? { chroma: 0, hue: 0, lightness: 0 };

	return blendOklch(from, stops[index + 1] ?? from, scaled - index);
}

// Chroma stays fixed, because darkening an orange while dropping its chroma turns it olive
function withLightness(colour: Oklch, lightness: number): Oklch {
	return { ...colour, lightness: Math.min(1, Math.max(0, lightness)) };
}

function scaled(colour: Oklch, factor: number): Oklch {
	return withLightness(colour, colour.lightness * factor);
}

// The body's colour, and the resting colour the peaks zone is drawn from
function bodyAndRest(cell: TintCell, reading: TintReading, palette: TintPalette): [Oklch, Oklch] {
	const at = (position: number): Oklch =>
		samplePalette(palette.stops, steppedPosition(position, palette.steps));

	if (cell.hue === undefined) {
		if (cell.dynamics === 'energy') return [at(reading.dynamics), at(reading.dynamics)];

		return [at(restPosition + onsetReach * reading.dynamics), at(restPosition)];
	}

	const hue = at(reading.balance);

	if (cell.dynamics === 'energy') {
		const base = scaled(hue, energyFloor + (1 - energyFloor) * reading.dynamics);

		return [base, base];
	}
	if (cell.dynamics === 'onsets') {
		const base = scaled(hue, onsetFloor + (onsetCeiling - onsetFloor) * reading.dynamics);

		return [base, scaled(hue, onsetFloor)];
	}

	return [hue, hue];
}

/**
 * With no hue source the dynamics move along the palette, and with one they only brighten or dim the hue
 * The peaks zone moves part of the way toward the surface, so it always sits between the body and the backdrop
 */
export function zoneColours(
	cell: TintCell,
	reading: TintReading,
	palette: TintPalette,
): ZoneColours {
	const [base, rest] = bodyAndRest(cell, reading, palette);
	const towardSurface = palette.peaksDepth * (palette.surfaceLightness - rest.lightness);

	return { base, peaks: withLightness(rest, rest.lightness + towardSurface) };
}

/** Returns 0 where the bass leads its median by the sensitivity, and 1 where the highs lead theirs by as much */
export function balanceOf(highOverLow: number, sensitivity: number): number {
	if (!(sensitivity > 0)) return 0.5;

	return clampProportion(0.5 + highOverLow / (2 * sensitivity));
}

/** Takes a linear amplitude and reads it in decibels, so the track's quiet level reads 0 and its loud level reads 1 */
export function energyReading(level: number, [quiet, loud]: readonly [number, number]): number {
	if (!(level > 0)) return 0;

	return clampProportion(Math.log(level / quiet) / Math.log(loud / quiet));
}

export function isLevelRange(range: readonly [number, number] | undefined): boolean {
	return range !== undefined && range[0] > 0 && range[1] > range[0];
}

/** The steepest rise of any band, in decibels, over the mean of the frames before it */
export function onsetAt(
	decibels: (frame: number, band: number) => number,
	[frame, bandCount]: [number, number],
): number {
	if (frame < onsetLookback) return 0;

	let rise = 0;

	for (let band = 0; band < bandCount; band += 1) {
		let before = 0;

		for (let back = 1; back <= onsetLookback; back += 1) before += decibels(frame - back, band);
		rise = Math.max(rise, decibels(frame, band) - before / onsetLookback);
	}

	return Math.min(1, rise / fullOnsetDecibels);
}

export function relativeDecibels(decibels: number, median: number): number {
	return Math.min(relativeLimit, Math.max(-relativeLimit, decibels - median));
}

export interface TintTable {
	/** Three bytes per entry, red, green and blue */
	base: Uint8Array;
	indexOf: (reading: TintReading) => number;
	peaks: Uint8Array;
}

// Finer steps would change no pixel, since one step already moves lightness by less than one sRGB byte
const singleReadingSize = 256;
const pairedReadingSize = 64;

// Built once per change of palette or cell, so a paint only looks colours up
export function tintTable(cell: TintCell, palette: TintPalette): TintTable {
	const isPaired = cell.hue !== undefined && cell.dynamics !== undefined;
	const size = isPaired ? pairedReadingSize : singleReadingSize;
	const count = isPaired ? size * size : size;
	const base = new Uint8Array(count * 3);
	const peaks = new Uint8Array(count * 3);

	for (let index = 0; index < count; index += 1) {
		const balance = (index % size) / (size - 1);
		const dynamics = isPaired ? Math.floor(index / size) / (size - 1) : balance;
		const colours = zoneColours(cell, { balance, dynamics }, palette);

		base.set(rgbOf(colours.base), index * 3);
		peaks.set(rgbOf(colours.peaks), index * 3);
	}

	const step = (reading: number): number => Math.round(clampProportion(reading) * (size - 1));
	const indexOf = isPaired
		? (reading: TintReading): number => step(reading.dynamics) * size + step(reading.balance)
		: (reading: TintReading): number => step(cell.hue ? reading.balance : reading.dynamics);

	return { base, indexOf, peaks };
}
