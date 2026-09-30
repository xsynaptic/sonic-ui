export interface TapClock {
	beatMs: number;
	phaseAt: number;
	taps: Array<number>;
}

const tapWindowMs = 2000;

export function beatMsOf(bpm: number): number {
	return 60_000 / Math.min(250, Math.max(40, bpm));
}

export function tap(clock: TapClock, now: number): void {
	const taps = [...clock.taps.filter((time) => now - time < tapWindowMs), now].slice(-5);

	clock.taps = taps;
	clock.phaseAt = now;

	const first = taps[0];
	if (first === undefined || taps.length < 2) return;

	clock.beatMs = beatMsOf(60_000 / ((now - first) / (taps.length - 1)));
}
