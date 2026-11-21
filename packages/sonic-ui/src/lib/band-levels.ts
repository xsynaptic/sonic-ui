import { relativeDecibels } from '#lib/wave-tint.ts';

export interface BandLevels {
	/** Bands per row, interleaved in `levels`, lowest first */
	bandCount: number;
	/** Unset follows the array: 255, 65535 or 1 */
	fullScale?: number;
	levels: Float32Array | Uint8Array | Uint16Array;
	/** Each band's median over the whole track, in the units of `levels`, which a spectral tint reads against */
	medians?: ArrayLike<number>;
	/** Reads a level as decibels, from this just above zero up to 0 at full scale; unset means linear */
	minDecibels?: number;
}

export interface LevelTable {
	bandCount: number;
	decibelsOf: (level: number) => number;
	levels: BandLevels['levels'];
	medians: ReadonlyArray<number> | undefined;
}

// A linear level of zero has no decibel value, so it reads as this, below any real band
const silentDecibels = -120;

function fullScaleOf({ fullScale, levels }: BandLevels): number {
	if (fullScale !== undefined) return fullScale;
	if (levels instanceof Uint8Array) return 255;

	return levels instanceof Uint16Array ? 65_535 : 1;
}

function decibelReader(bands: BandLevels): (level: number) => number {
	const fullScale = fullScaleOf(bands);
	const minDecibels = Math.min(0, bands.minDecibels ?? 0);

	return (level) => {
		const proportion = Math.min(1, level / fullScale);

		if (minDecibels < 0) return proportion > 0 ? minDecibels * (1 - proportion) : minDecibels;

		return proportion > 0 ? Math.max(silentDecibels, 20 * Math.log10(proportion)) : silentDecibels;
	};
}

export function levelTable(bands: BandLevels | undefined): LevelTable | undefined {
	if (!bands) return undefined;

	const { bandCount, levels } = bands;
	if (!Number.isSafeInteger(bandCount) || bandCount < 1) return undefined;

	const read = decibelReader(bands);
	const medians =
		bands.medians && bands.medians.length >= bandCount
			? Array.from({ length: bandCount }, (_median, band) => read(bands.medians?.[band] ?? 0))
			: undefined;
	if (levels instanceof Float32Array) return { bandCount, decibelsOf: read, levels, medians };

	const decibels = Float32Array.from(
		{ length: levels instanceof Uint8Array ? 256 : 65_536 },
		(_decibel, level) => read(level),
	);

	return {
		bandCount,
		decibelsOf: (level) => decibels[level] ?? silentDecibels,
		levels,
		medians,
	};
}

export function highOverLow(
	{ bandCount, decibelsOf, levels, medians = [] }: LevelTable,
	row: number,
): number {
	const high = bandCount - 1;
	const lowDecibels = decibelsOf(levels[row * bandCount] ?? 0);
	const highDecibels = decibelsOf(levels[row * bandCount + high] ?? 0);

	return (
		relativeDecibels(highDecibels, medians[high] ?? 0) -
		relativeDecibels(lowDecibels, medians[0] ?? 0)
	);
}
