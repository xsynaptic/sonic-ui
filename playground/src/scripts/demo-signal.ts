export function gainOf(decibels: number): number {
	return decibels <= -60 ? 0 : 10 ** (decibels / 20);
}

// Peaks pass full scale now and then, so the hold and clip show
export function levelAt(time: number, channel: number, beatMs: number): number {
	const beat = Math.floor(time / beatMs);
	const decay = (1 - (time % beatMs) / beatMs) ** 3;
	const gain = 0.3 + 0.78 * Math.abs(Math.sin(beat * 1.7 + channel * 0.6));

	return gain * decay;
}
