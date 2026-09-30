export function frameLoop(tick: (time: number) => void) {
	let frame: number | undefined;

	const loop = (time: number): void => {
		tick(time);
		frame = requestAnimationFrame(loop);
	};

	function stop(): void {
		if (frame !== undefined) cancelAnimationFrame(frame);
		frame = undefined;
	}

	function start(): void {
		stop();
		frame = requestAnimationFrame(loop);
	}

	return { start, stop };
}

export function isMotionAllowed(): boolean {
	return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}
