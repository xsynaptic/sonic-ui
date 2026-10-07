import { clamp } from '#lib/math.ts';
import { capturePointer } from '#lib/pointer-drag.ts';

interface Pinch {
	pointerIds: [number, number];
	startSpanPx: number;
	startZoom: number;
}

interface ZoomTarget {
	isDisabled: () => boolean;
	isZoomable: () => boolean;
	zoom: () => number;
	zoomTo: (target: number) => void;
}

interface ZoomOptions extends ZoomTarget {
	claim: () => void;
}

interface Touches {
	isPinching: () => boolean;
	isTouched: () => boolean;
}

export interface ZoomGesture {
	isPinching: () => boolean;
	sync: () => void;
}

const wheelRate = 0.01;
const linePx = 16;
const pixelMode = 0;

const wheelCapPx = 25;

const minSpanPx = 16;

const zoomKeys = new Map([
	['+', 1],
	['-', -1],
	['=', 1],
]);

export const zoomKeyFactor = Math.exp(wheelCapPx * wheelRate);

export function wheelFactor(deltaY: number, deltaMode: number): number {
	const pixels = deltaMode === pixelMode ? deltaY : deltaY * linePx;

	return Math.exp(-clamp(pixels, -wheelCapPx, wheelCapPx) * wheelRate);
}

export function pinchFactor(startSpanPx: number, spanPx: number): number {
	return Math.max(minSpanPx, Math.abs(spanPx)) / Math.max(minSpanPx, Math.abs(startSpanPx));
}

function bindPinch(control: HTMLElement, options: ZoomOptions, signal: AbortSignal): Touches {
	const touches = new Map<number, number>();
	let pinch: Pinch | undefined;
	let isPinchSpent = false;

	const spanPx = ([first, second]: [number, number]): number =>
		(touches.get(second) ?? 0) - (touches.get(first) ?? 0);
	const touchPair = (): [number, number] | undefined => {
		const [first, second, third] = touches.keys();
		if (first === undefined || second === undefined || third !== undefined) return undefined;

		return [first, second];
	};

	control.addEventListener(
		'pointerdown',
		(event) => {
			if (event.pointerType !== 'touch' || !options.isZoomable() || options.isDisabled()) return;

			touches.set(event.pointerId, event.clientX);
			if (pinch || isPinchSpent) return;

			const pointerIds = touchPair();
			if (!pointerIds) return;

			options.claim();
			capturePointer(control, event.pointerId);
			pinch = { pointerIds, startSpanPx: spanPx(pointerIds), startZoom: options.zoom() };
		},
		{ signal },
	);
	control.addEventListener(
		'pointermove',
		(event) => {
			if (!touches.has(event.pointerId)) return;

			touches.set(event.pointerId, event.clientX);
			if (!pinch?.pointerIds.includes(event.pointerId)) return;

			options.zoomTo(pinch.startZoom * pinchFactor(pinch.startSpanPx, spanPx(pinch.pointerIds)));
		},
		{ signal },
	);
	for (const type of ['pointerup', 'pointercancel'] as const) {
		control.addEventListener(
			type,
			(event) => {
				if (!touches.delete(event.pointerId)) return;

				if (pinch?.pointerIds.includes(event.pointerId)) {
					pinch = undefined;
					isPinchSpent = true;
				}
				if (touches.size === 0) isPinchSpent = false;
			},
			{ signal },
		);
	}

	return {
		isPinching: () => pinch !== undefined || isPinchSpent,
		isTouched: () => touches.size > 0,
	};
}

function bindWheel(
	control: HTMLElement,
	options: Pick<Touches, 'isTouched'> & ZoomTarget,
	signal: AbortSignal,
): void {
	// Chromium cannot cancel a wheel heard only on the `display: contents` host
	control.addEventListener(
		'wheel',
		(event) => {
			if ((!event.ctrlKey && !event.metaKey) || options.isDisabled()) return;

			event.preventDefault();
			options.zoomTo(options.zoom() * wheelFactor(event.deltaY, event.deltaMode));
		},
		{ passive: false, signal },
	);

	let startZoom = options.zoom();

	// Safari sends a trackpad pinch as gesture events, never as a ctrl wheel
	for (const type of ['gesturestart', 'gesturechange']) {
		control.addEventListener(
			type,
			(event) => {
				if (options.isDisabled() || options.isTouched()) return;

				event.preventDefault();
				if (type === 'gesturestart') startZoom = options.zoom();
				else if ('scale' in event && typeof event.scale === 'number') {
					options.zoomTo(startZoom * event.scale);
				}
			},
			{ signal },
		);
	}
}

export function bindZoom(
	control: HTMLElement,
	options: ZoomOptions,
	signal: AbortSignal,
): ZoomGesture {
	const { isPinching, isTouched } = bindPinch(control, options, signal);
	let wheel: AbortController | undefined;

	// The wheel listener is not passive, so it is bound only while zooming is on
	const sync = (): void => {
		wheel?.abort();
		wheel = undefined;
		if (signal.aborted || !options.isZoomable()) return;

		wheel = new AbortController();
		bindWheel(control, { ...options, isTouched }, wheel.signal);
	};

	signal.addEventListener('abort', sync, { once: true });
	sync();

	return { isPinching, sync };
}

export function bindZoomKeys(control: HTMLElement, target: ZoomTarget, signal: AbortSignal): void {
	control.addEventListener(
		'keydown',
		(event) => {
			if (!target.isZoomable() || target.isDisabled() || event.target !== control) return;
			if (event.ctrlKey || event.metaKey || event.altKey) return;

			const direction = zoomKeys.get(event.key);
			if (direction === undefined) return;

			event.preventDefault();
			target.zoomTo(target.zoom() * zoomKeyFactor ** direction);
		},
		{ signal },
	);
}
