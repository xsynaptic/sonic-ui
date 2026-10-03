const seekThresholdSeconds = 0.5;
const jitterSeconds = 0.05;

// The share of the error closed in a 60 Hz frame; scaled by elapsed time so every refresh rate converges alike
const catchUpPerFrame = 0.06;

interface ClockSource {
	isPlaying: boolean;
	rate: number;
	seconds: number;
}

interface TrackingClock {
	// `frameMs` is the frame's timestamp, never `performance.now()` in the callback
	read: (frameMs: number, source: ClockSource) => number;
}

function isLandingOnSource(
	{ isPlaying, seconds }: ClockSource,
	carried: number,
	lastSourceSeconds: number | undefined,
): boolean {
	const hasSteppedBack =
		lastSourceSeconds !== undefined && lastSourceSeconds - seconds > jitterSeconds;

	return !isPlaying || hasSteppedBack || Math.abs(seconds - carried) > seekThresholdSeconds;
}

export function createTrackingClock(): TrackingClock {
	let positionSeconds: number | undefined;
	let lastFrameMs: number | undefined;
	let lastSourceSeconds: number | undefined;
	let wasPlaying = false;

	return {
		read: (frameMs, source) => {
			const { isPlaying, rate, seconds } = source;
			const elapsedSeconds = wasPlaying
				? Math.max(0, frameMs - (lastFrameMs ?? frameMs)) / 1000
				: 0;
			const carried = (positionSeconds ?? seconds) + elapsedSeconds * rate;

			lastFrameMs = frameMs;
			wasPlaying = isPlaying;

			if (!Number.isFinite(seconds)) {
				if (positionSeconds !== undefined) positionSeconds = carried;
				return carried;
			}

			const isLanding = isLandingOnSource(source, carried, lastSourceSeconds);

			lastSourceSeconds = seconds;

			if (positionSeconds === undefined || isLanding) {
				positionSeconds = seconds;
				return positionSeconds;
			}

			positionSeconds =
				carried + (seconds - carried) * (1 - (1 - catchUpPerFrame) ** (elapsedSeconds * 60));

			return positionSeconds;
		},
	};
}
