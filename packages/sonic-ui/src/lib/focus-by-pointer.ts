const modifierKeys = new Set(['Alt', 'Control', 'Meta', 'Shift']);

// A script focus during a mouse press still matches `:focus-visible`
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

	target.addEventListener(
		'blur',
		() => {
			// A window or tab switch blurs the target and leaves it the active element
			if (target.ownerDocument.activeElement !== target) clear();
		},
		{ signal: marking.signal },
	);
	target.addEventListener(
		'keydown',
		(event) => {
			if (event.metaKey || event.ctrlKey || event.altKey || modifierKeys.has(event.key)) return;

			clear();
		},
		{ signal: marking.signal },
	);
}
