interface DragHandlers<Drag> {
	cancel?: (drag: Drag) => void;
	grab: (event: PointerEvent) => Drag | undefined;
	// Capturing on press would swallow a click on a link inside the target; the caller captures once the press is a drag
	isCaptureLate?: boolean;
	lift?: (drag: Drag, event: PointerEvent) => void;
	move: (drag: Drag, event: PointerEvent) => void;
	release?: (drag: Drag) => void;
	toggle?: (isDragging: boolean) => void;
}

export interface PointerDrag<Drag> {
	current: () => Drag | undefined;
	end: () => void;
}

export function capturePointer(target: HTMLElement, pointerId: number): void {
	try {
		target.setPointerCapture(pointerId);
	} catch {
		// A synthetic pointer has no id to capture; the gesture carries on uncaptured
	}
}

export function bindDrag<Drag>(
	target: HTMLElement,
	handlers: DragHandlers<Drag>,
	signal: AbortSignal,
): PointerDrag<Drag> {
	const isCaptureLate = handlers.isCaptureLate === true;
	let held: undefined | { drag: Drag; pointerId: number };

	const end = (): void => {
		if (!held) return;

		const { drag } = held;

		held = undefined;
		handlers.toggle?.(false);
		handlers.release?.(drag);
	};
	const whileHeld = (
		type: 'lostpointercapture' | 'pointercancel' | 'pointerleave' | 'pointermove' | 'pointerup',
		handle: (drag: Drag, event: PointerEvent) => void,
	): void => {
		target.addEventListener(
			type,
			(event) => {
				if (held?.pointerId === event.pointerId) handle(held.drag, event);
			},
			{ signal },
		);
	};

	target.addEventListener(
		'pointerdown',
		(event) => {
			if (event.button !== 0 || (held && held.pointerId !== event.pointerId)) return;

			end();

			const drag = handlers.grab(event);
			if (drag === undefined) return;

			held = { drag, pointerId: event.pointerId };
			handlers.toggle?.(true);
			if (!isCaptureLate) capturePointer(target, event.pointerId);
		},
		{ signal },
	);
	whileHeld('pointermove', handlers.move);
	whileHeld('pointercancel', (drag) => {
		handlers.cancel?.(drag);
		end();
	});
	// Capturing late takes a touch away from the child it landed on, and that child's `lostpointercapture` bubbles up here
	whileHeld('lostpointercapture', (_drag, event) => {
		if (!isCaptureLate || event.target === target) end();
	});
	if (isCaptureLate) {
		whileHeld('pointerleave', (_drag, event) => {
			if (!target.hasPointerCapture(event.pointerId)) end();
		});
	}
	whileHeld('pointerup', (drag, event) => {
		end();
		handlers.lift?.(drag, event);
	});
	signal.addEventListener('abort', end, { once: true });

	return { current: () => held?.drag, end };
}
