import { clamp } from '#lib/math.ts';

const wheelRate = 0.01;
const linePx = 16;
const pixelMode = 0;

const wheelCapPx = 25;

const minSpanPx = 16;

export const zoomKeyFactor = Math.exp(wheelCapPx * wheelRate);

export function wheelFactor(deltaY: number, deltaMode: number): number {
	const pixels = deltaMode === pixelMode ? deltaY : deltaY * linePx;

	return Math.exp(-clamp(pixels, -wheelCapPx, wheelCapPx) * wheelRate);
}

export function pinchFactor(startSpanPx: number, spanPx: number): number {
	return Math.max(minSpanPx, Math.abs(spanPx)) / Math.max(minSpanPx, Math.abs(startSpanPx));
}
