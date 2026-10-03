const seekThresholdSeconds = 0.5;

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

export function createTrackingClock(): TrackingClock {
	let positionSeconds: number | undefined;
	let lastFrameMs: number | undefined;
	let wasPlaying = false;

	return {
		read: (frameMs, { isPlaying, rate, seconds }) => {
			const elapsedSeconds =
				wasPlaying && lastFrameMs !== undefined ? Math.max(0, frameMs - lastFrameMs) / 1000 : 0;
			const carried = (positionSeconds ?? seconds) + elapsedSeconds * rate;

			lastFrameMs = frameMs;
			wasPlaying = isPlaying;

			if (
				positionSeconds === undefined ||
				!isPlaying ||
				Math.abs(seconds - carried) > seekThresholdSeconds
			) {
				positionSeconds = seconds;
				return positionSeconds;
			}

			positionSeconds =
				carried + (seconds - carried) * (1 - (1 - catchUpPerFrame) ** (elapsedSeconds * 60));

			return positionSeconds;
		},
	};
}
