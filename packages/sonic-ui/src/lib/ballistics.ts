export interface Needle {
	position: number;
	velocity: number;
}

interface BallisticsRate {
	fallDecibelsPerSecond: number;
	riseMs: number;
}

// The PPM returns are IEC 60268-10's: 20 dB in 1.7s for Type I, 24 dB in 2.8s for Type II
export const ballisticsRates = {
	peak: { fallDecibelsPerSecond: 20, riseMs: 0 },
	'ppm-1': { fallDecibelsPerSecond: 20 / 1.7, riseMs: 5 },
	'ppm-2': { fallDecibelsPerSecond: 24 / 2.8, riseMs: 10 },
} as const satisfies Record<string, BallisticsRate>;

// A VU's step response: 99% in 300ms with 1 to 1.5% overshoot
const needleDamping = 0.81;
const needleRadiansPerSecond = 13.5;

// Longer steps make the response depend on the frame rate
const needleStepMs = 4;

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
	const steps = Math.ceil(elapsedMs / needleStepMs);
	const seconds = elapsedMs / steps / 1000;
	let { position, velocity } = needle;

	for (let step = 0; step < steps; step += 1) {
		const pull = needleRadiansPerSecond ** 2 * (target - position);
		const drag = 2 * needleDamping * needleRadiansPerSecond * velocity;

		velocity += (pull - drag) * seconds;
		position += velocity * seconds;
	}

	return { position, velocity };
}
