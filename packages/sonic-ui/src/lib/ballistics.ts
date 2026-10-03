interface Needle {
	carryMs: number;
	position: number;
	velocity: number;
}

interface BallisticsRate {
	fallDecibelsPerSecond: number;
	riseMs: number;
}

interface PpmSpec {
	burstMs: number;
	fallDecibels: number;
	fallSeconds: number;
}

// IEC 60268-10: a tone burst as long as the integration time reads this far under a steady tone
const burstShortfallDecibels = 2;
const burstTimeConstants = -Math.log(1 - 10 ** (-burstShortfallDecibels / 20));

function ppmRate({ burstMs, fallDecibels, fallSeconds }: PpmSpec): BallisticsRate {
	return {
		fallDecibelsPerSecond: fallDecibels / fallSeconds,
		riseMs: burstMs / burstTimeConstants,
	};
}

// The PPM figures are IEC 60268-10's Type I and Type II
export const ballisticsRates = {
	peak: { fallDecibelsPerSecond: 20, riseMs: 0 },
	'ppm-1': ppmRate({ burstMs: 5, fallDecibels: 20, fallSeconds: 1.7 }),
	'ppm-2': ppmRate({ burstMs: 10, fallDecibels: 24, fallSeconds: 2.8 }),
} as const satisfies Record<string, BallisticsRate>;

// Tuned to a VU's step response: 99% in 300ms with 1 to 1.5% overshoot
const needleDamping = 0.8;
const needleRadiansPerSecond = 13.5;

const needleStepMs = 4;
const needleSettleMs = 1000;

// A meter's return is specified linear in dB
export function fall(
	current: number,
	{ fallDecibelsPerSecond, floor }: { fallDecibelsPerSecond: number; floor: number },
	elapsedMs: number,
): number {
	return Math.max(floor, current - (fallDecibelsPerSecond * elapsedMs) / 1000);
}

export function rise(
	current: number,
	{ target, timeConstantMs }: { target: number; timeConstantMs: number },
	elapsedMs: number,
): number {
	if (timeConstantMs <= 0) return target;

	return target + (current - target) * Math.exp(-elapsedMs / timeConstantMs);
}

export function stepNeedle(needle: Needle, target: number, elapsedMs: number): Needle {
	const dueMs = Math.min(needle.carryMs + elapsedMs, needleSettleMs);
	const steps = Math.floor(dueMs / needleStepMs);
	const seconds = needleStepMs / 1000;
	let { position, velocity } = needle;

	for (let step = 0; step < steps; step += 1) {
		const pull = needleRadiansPerSecond ** 2 * (target - position);
		const drag = 2 * needleDamping * needleRadiansPerSecond * velocity;

		velocity += (pull - drag) * seconds;
		position += velocity * seconds;
	}

	return { carryMs: dueMs - steps * needleStepMs, position, velocity };
}
