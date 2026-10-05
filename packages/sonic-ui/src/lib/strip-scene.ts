import type { SurfaceSize } from '#lib/canvas-surface.ts';

import { clampProportion } from '#lib/math.ts';
import { resamplePeaks } from '#lib/resample-peaks.ts';

interface BarRect {
	height: number;
	radius: number;
	width: number;
	x: number;
	y: number;
}

interface BarGrid {
	gapRatio: number;
	pitch: number;
	radiusRatio: number;
}

interface RegionState {
	buffered: ReadonlyArray<[number, number]>;
	played: number;
	scrub?: number;
}

export interface StripRegions {
	key: string;
	regions: Array<{ from: number; kind: 'buffered' | 'played' | 'scrub'; to: number }>;
}

// Whole device pixels, or bars alias unevenly and Skia's CPU raster crawls
export function stripBars(
	peaks: ArrayLike<number>,
	size: SurfaceSize,
	grid: BarGrid,
): Array<BarRect> {
	const pitch = Math.max(1, Math.round(grid.pitch * size.dpr));
	const gap = Math.min(pitch - 1, Math.max(0, Math.round(pitch * grid.gapRatio)));
	const width = pitch - gap;
	const count = Math.max(0, Math.floor((size.width + gap) / pitch));

	return resamplePeaks(peaks, count).map((peak, index) => {
		const height = Math.max(1, Math.round(clampProportion(peak) * size.height));

		return {
			height,
			radius: width * grid.radiusRatio,
			width,
			x: index * pitch,
			y: Math.round((size.height - height) / 2),
		};
	});
}

export function stripGroove(size: SurfaceSize, ratio: number): BarRect | undefined {
	if (ratio <= 0) return undefined;

	const height = Math.max(1, Math.round(size.height * ratio));

	return {
		height,
		radius: height / 2,
		width: size.width,
		x: 0,
		y: Math.round((size.height - height) / 2),
	};
}

export function stripRegions(state: RegionState, widthPx: number): StripRegions {
	const px = (proportion: number): number =>
		Math.round((Number.isFinite(proportion) ? proportion : 0) * widthPx);
	const buffered = state.buffered
		.map(([start, end]): [number, number] => [px(start), px(end)])
		.filter(([start, end]) => end > start);
	const played = px(state.played);
	const scrub = state.scrub === undefined ? played : px(state.scrub);
	const regions: StripRegions['regions'] = buffered.map(([from, to]) => ({
		from,
		kind: 'buffered',
		to,
	}));

	if (played > 0) regions.push({ from: 0, kind: 'played', to: played });
	if (scrub !== played) {
		regions.push({ from: Math.min(played, scrub), kind: 'scrub', to: Math.max(played, scrub) });
	}

	return { key: `${String(played)}:${String(scrub)}:${buffered.join(',')}`, regions };
}
