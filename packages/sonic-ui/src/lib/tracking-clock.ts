const seekThresholdSeconds = 0.5;

const catchUpPerFrame = 0.06;

export interface TrackingClock {
	// `frameMs` is the frame's timestamp, never `performance.now()` in the callback
	read: (frameMs: number, sourceSeconds: number, isPlaying: boolean) => number;
}

export function createTrackingClock(): TrackingClock {
	let positionSeconds: number | undefined;
	let lastFrameMs: number | undefined;
	let wasPlaying = false;

	return {
		read: (frameMs, sourceSeconds, isPlaying) => {
			const elapsedSeconds =
				wasPlaying && lastFrameMs !== undefined ? Math.max(0, frameMs - lastFrameMs) / 1000 : 0;

			lastFrameMs = frameMs;
			wasPlaying = isPlaying;

			if (
				positionSeconds === undefined ||
				!isPlaying ||
				Math.abs(sourceSeconds - (positionSeconds + elapsedSeconds)) > seekThresholdSeconds
			) {
				positionSeconds = sourceSeconds;
				return positionSeconds;
			}

			positionSeconds += elapsedSeconds;
			positionSeconds += (sourceSeconds - positionSeconds) * catchUpPerFrame;

			return positionSeconds;
		},
	};
}
