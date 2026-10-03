export interface Hold {
	hold(by: number | string): boolean;
	release(): void;
}

interface HoldOptions {
	canHold: () => boolean;
	leave: 'blur' | 'focusout';
	onHold: () => void;
	onRelease: () => void;
}

export function bindHold(target: HTMLElement, options: HoldOptions, signal: AbortSignal): Hold {
	let holder: number | string | undefined;
	const hold: Hold = {
		hold(by) {
			if (holder !== undefined || !options.canHold()) return false;

			holder = by;
			options.onHold();

			return true;
		},
		release() {
			if (holder === undefined) return;

			holder = undefined;
			options.onRelease();
		},
	};
	const releasePointer = (event: PointerEvent): void => {
		if (event.pointerId === holder) hold.release();
	};

	target.addEventListener('lostpointercapture', releasePointer, { signal });
	target.addEventListener('pointercancel', releasePointer, { signal });
	target.addEventListener('pointerup', releasePointer, { signal });
	target.addEventListener(
		'keyup',
		(event) => {
			// macOS sends no `keyup` for a key let go while Cmd is down
			const isMetaLift = event.key === 'Meta' && typeof holder === 'string';

			if (isMetaLift || event.key === holder) hold.release();
		},
		{ signal },
	);
	target.addEventListener(
		options.leave,
		(event) => {
			const next = event.relatedTarget;
			const isInside = next instanceof Node && target.contains(next);

			if (typeof holder === 'string' && !isInside) hold.release();
		},
		{ signal },
	);
	signal.addEventListener(
		'abort',
		() => {
			hold.release();
		},
		{ once: true },
	);

	return hold;
}
