interface HoverOptions {
	canShow: () => boolean;
	dismiss: () => void;
	isTaken: () => boolean;
	show: () => void;
	valueAt: (event: PointerEvent) => number | undefined;
}

export interface HoverPreview {
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
				hover = undefined;
				isDismissed = true;
				options.dismiss();
			},
			{ signal: escapeWatch.signal },
		);
	};
	const hoverAt = (value: number | undefined): void => {
		if (value === undefined) isDismissed = false;
		if (!isDismissed && !options.isTaken()) hover = value;
		options.show();
		watchEscape(value !== undefined);
	};

	target.addEventListener(
		'pointermove',
		(event) => {
			if (event.pointerType === 'touch' || event.buttons !== 0 || !options.canShow()) return;

			hoverAt(options.valueAt(event));
		},
		{ signal },
	);
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
		clear: () => {
			hover = undefined;
		},
		value: () => hover,
	};
}
