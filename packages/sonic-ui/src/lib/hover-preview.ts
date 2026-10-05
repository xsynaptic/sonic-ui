interface HoverOptions {
	canShow: () => boolean;
	changed: () => void;
	dismiss: () => void;
	isTaken: () => boolean;
	show: () => void;
	valueAt: (event: PointerEvent) => number | undefined;
}

export interface HoverPreview {
	at: (event: PointerEvent) => void;
	clear: () => void;
	value: () => number | undefined;
}

export function bindHoverPreview(
	target: HTMLElement,
	options: HoverOptions,
	signal: AbortSignal,
): HoverPreview {
	let hover: number | undefined;
	let isDismissed = false;
	let escapeWatch: AbortController | undefined;

	const hold = (value: number | undefined): void => {
		if (value === hover) return;

		hover = value;
		options.changed();
	};

	// A hover holds no focus, so the key is heard on the document (WCAG 1.4.13)
	const watchEscape = (isHovered: boolean): void => {
		if (!isHovered) {
			escapeWatch?.abort();
			escapeWatch = undefined;
			return;
		}
		if (escapeWatch) return;

		escapeWatch = new AbortController();
		target.ownerDocument.addEventListener(
			'keydown',
			(event) => {
				if (hover === undefined || event.key !== 'Escape') return;

				// Stays dismissed until the hover ends, or the next pointer move would bring it straight back
				isDismissed = true;
				hold(undefined);
				options.dismiss();
			},
			{ signal: escapeWatch.signal },
		);
	};
	const hoverAt = (value: number | undefined): void => {
		if (value === undefined) isDismissed = false;
		if (!isDismissed && !options.isTaken()) hold(value);
		options.show();
		watchEscape(value !== undefined);
	};

	const at = (event: PointerEvent): void => {
		if (event.pointerType === 'touch' || event.buttons !== 0 || !options.canShow()) return;

		hoverAt(options.valueAt(event));
	};

	target.addEventListener('pointermove', at, { signal });
	for (const type of ['pointerdown', 'pointerleave']) {
		target.addEventListener(
			type,
			() => {
				hoverAt(undefined);
			},
			{ signal },
		);
	}
	signal.addEventListener(
		'abort',
		() => {
			watchEscape(false);
		},
		{ once: true },
	);

	return {
		at,
		clear: () => {
			hold(undefined);
		},
		value: () => hover,
	};
}
