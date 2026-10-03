import type { SonicKey } from '@xsynaptic/sonic-ui';

const maxElapsedSeconds = 0.1;

export function frameLoop(onFrame: (elapsedSeconds: number, time: number) => boolean | undefined) {
	let frame: number | undefined;
	let last: number | undefined;
	let isRunning = false;

	function wake(): void {
		if (isRunning && frame === undefined) frame = requestAnimationFrame(loop);
	}

	function loop(time: number): void {
		const elapsedSeconds =
			last === undefined ? 0 : Math.min((time - last) / 1000, maxElapsedSeconds);

		frame = undefined;
		last = time;
		if (onFrame(elapsedSeconds, time) === false) {
			last = undefined;
			return;
		}
		wake();
	}

	function stop(): void {
		isRunning = false;
		if (frame !== undefined) cancelAnimationFrame(frame);
		frame = undefined;
		last = undefined;
	}

	function start(): void {
		stop();
		isRunning = true;
		wake();
	}

	return { start, stop, wake };
}

function isMotionAllowed(): boolean {
	return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function bindRun(
	keys: ReadonlyArray<SonicKey>,
	run: { start(): void; stop(): void },
): (isRunning: boolean) => void {
	const setRunning = (isRunning: boolean): void => {
		for (const key of keys) key.pressed = isRunning;
		if (!isRunning) {
			run.stop();
			return;
		}

		run.start();
	};

	for (const key of keys) {
		key.addEventListener('change', () => {
			setRunning(key.pressed);
		});
	}
	setRunning(isMotionAllowed());

	return setRunning;
}
