// Firefox never matches `:active` on a button that a key holds
export function bindKeyPress(root: HTMLElement, signal: AbortSignal): void {
	let pressed: HTMLButtonElement | undefined;
	const release = (): void => {
		if (!pressed) return;

		delete pressed.dataset.sonicActive;
		pressed = undefined;
	};

	root.addEventListener(
		'keydown',
		(event) => {
			if (event.key !== ' ' || event.repeat || event.defaultPrevented) return;

			const part = event.target;
			if (!(part instanceof HTMLButtonElement) || part.disabled) return;

			release();
			pressed = part;
			part.dataset.sonicActive = '';
		},
		{ signal },
	);
	root.addEventListener(
		'keyup',
		(event) => {
			// macOS sends no `keyup` for a key let go while Cmd is down
			if (event.key === ' ' || event.key === 'Meta') release();
		},
		{ signal },
	);
	root.addEventListener(
		'focusout',
		(event) => {
			if (event.target === pressed) release();
		},
		{ signal },
	);
	signal.addEventListener('abort', release, { once: true });
}
