export function bindFill(
	control: HTMLElement,
	sizeProperty: `--_sonic-${string}`,
	signal: AbortSignal,
): (isFilling: boolean) => void {
	let watch: ResizeObserver | undefined;

	const stop = (): void => {
		watch?.disconnect();
		watch = undefined;
	};

	signal.addEventListener('abort', stop, { once: true });

	return (isFilling) => {
		if (signal.aborted || isFilling === (watch !== undefined)) return;

		stop();
		if (!isFilling) {
			control.style.removeProperty(sizeProperty);
			return;
		}

		const started = new ResizeObserver((entries) => {
			const box = entries.at(-1)?.borderBoxSize[0];
			if (!box) return;

			// Written a frame on, or the canvas resizes inside this delivery and WebKit reports a loop
			requestAnimationFrame(() => {
				if (watch === started) {
					control.style.setProperty(sizeProperty, `${String(box.blockSize)}px`);
				}
			});
		});

		watch = started;
		started.observe(control);
	};
}
