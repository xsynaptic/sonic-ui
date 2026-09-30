interface Hold {
	holder: () => number | string | undefined;
	release: () => void;
}

export function bindHoldRelease(
	target: HTMLElement,
	{ holder, release }: Hold,
	signal: AbortSignal,
): void {
	const releasePointer = (event: PointerEvent): void => {
		if (event.pointerId === holder()) release();
	};

	target.addEventListener('lostpointercapture', releasePointer, { signal });
	target.addEventListener('pointercancel', releasePointer, { signal });
	target.addEventListener('pointerup', releasePointer, { signal });
	target.addEventListener(
		'keyup',
		(event) => {
			if (event.key === holder()) release();
		},
		{ signal },
	);
}
