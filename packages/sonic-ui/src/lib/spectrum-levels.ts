import { ballisticsRates, fall } from '#lib/ballistics.ts';

export interface SpectrumLevels {
	bars: Float64Array;
	heldAt: Float64Array;
	holds: Float64Array;
	incoming: Float64Array;
}

interface LevelStep {
	elapsedMs: number;
	floor: number;
	isHeld: boolean;
	isHoldStepped: boolean;
	nowMs: number;
}

const holdMs = 1500;

export function createLevels(binCount: number): SpectrumLevels {
	return {
		bars: new Float64Array(binCount).fill(-Infinity),
		heldAt: new Float64Array(binCount).fill(-Infinity),
		holds: new Float64Array(binCount).fill(-Infinity),
		incoming: new Float64Array(binCount).fill(-Infinity),
	};
}

// Collected apart from the bars, so a level received this frame is drawn before it falls
export function receiveLevels(
	{ incoming }: SpectrumLevels,
	frame: ArrayLike<number>,
	floor: number,
): void {
	for (let bin = 0; bin < incoming.length; bin += 1) {
		const level = frame[bin] ?? NaN;

		incoming[bin] = Math.max(incoming[bin] ?? floor, Number.isFinite(level) ? level : floor);
	}
}

function fallenHold(
	hold: number,
	bar: number,
	{
		elapsedMs,
		isHoldStepped,
		pastHoldMs,
	}: Pick<LevelStep, 'elapsedMs' | 'isHoldStepped'> & {
		pastHoldMs: number;
	},
): number {
	if (pastHoldMs < 0) return hold;
	if (isHoldStepped) return bar;

	return fall(
		hold,
		{ fallDecibelsPerSecond: ballisticsRates.peak.fallDecibelsPerSecond, floor: bar },
		Math.min(elapsedMs, pastHoldMs),
	);
}

export function stepLevels(levels: SpectrumLevels, step: LevelStep): void {
	const { bars, heldAt, holds, incoming } = levels;
	const rate = {
		fallDecibelsPerSecond: ballisticsRates.peak.fallDecibelsPerSecond,
		floor: step.floor,
	};

	for (let bin = 0; bin < bars.length; bin += 1) {
		const bar = Math.max(
			fall(bars[bin] ?? step.floor, rate, step.elapsedMs),
			incoming[bin] ?? step.floor,
		);
		const hold = holds[bin] ?? bar;

		bars[bin] = bar;
		incoming[bin] = -Infinity;
		if (!step.isHeld || bar >= hold) {
			holds[bin] = bar;
			heldAt[bin] = step.nowMs;
			continue;
		}

		const pastHoldMs = step.nowMs - (heldAt[bin] ?? step.nowMs) - holdMs;

		holds[bin] = fallenHold(hold, bar, { ...step, pastHoldMs });
	}
}

// A hold never sits under its bar, so the holds alone say whether anything is left to fall
export function areSettled({ holds }: SpectrumLevels, floor: number): boolean {
	return holds.every((hold) => hold <= floor);
}
