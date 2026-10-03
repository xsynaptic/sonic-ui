const tapWindowMs = 2000;
const tapsKept = 5;

export function beatMsOf(bpm: number): number {
	return 60_000 / Math.min(250, Math.max(40, bpm));
}

export function createTapTempo(bpm: number) {
	let beatMs = beatMsOf(bpm);
	let anchor = 0;
	let taps: Array<number> = [];

	return {
		phaseAt(time: number): number {
			return ((((time - anchor) % beatMs) + beatMs) % beatMs) / beatMs;
		},
		tap(now: number): number | undefined {
			taps = [...taps.filter((time) => now - time < tapWindowMs), now].slice(-tapsKept);
			anchor = now;

			const first = taps[0];
			if (first === undefined || taps.length < 2) return undefined;

			beatMs = beatMsOf(60_000 / ((now - first) / (taps.length - 1)));

			return 60_000 / beatMs;
		},
	};
}
