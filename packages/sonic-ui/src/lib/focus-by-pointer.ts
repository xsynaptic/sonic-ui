const modifierKeys = new Set(['Alt', 'Control', 'Meta', 'Shift']);

// A script focus during a mouse press still matches `:focus-visible` in Chromium and WebKit
export function focusByPointer(target: HTMLElement): void {
	const isMarked = 'sonicPointerFocus' in target.dataset;

	target.dataset.sonicPointerFocus = '';
	target.focus();
	if (isMarked) return;

	const marking = new AbortController();
	const clear = (): void => {
		delete target.dataset.sonicPointerFocus;
		marking.abort();
	};

	target.addEventListener('blur', clear, { signal: marking.signal });
	target.addEventListener(
		'keydown',
		(event) => {
			if (!modifierKeys.has(event.key)) clear();
		},
		{ signal: marking.signal },
	);
}
