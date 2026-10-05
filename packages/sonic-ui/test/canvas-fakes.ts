import { vi } from 'vitest';

type Report<Entry> = (entries: Array<Entry>) => void;

function boxSize([inlineSize, blockSize]: [number, number]): Array<ResizeObserverSize> {
	return [{ blockSize, inlineSize }];
}

export class FakeResizeObserver {
	static readonly instances: Array<FakeResizeObserver> = [];

	static refusesDeviceBox = false;

	isDisconnected = false;

	readonly #report: Report<ResizeObserverEntry>;

	constructor(report: Report<ResizeObserverEntry>) {
		this.#report = report;
		FakeResizeObserver.instances.push(this);
	}

	disconnect(): void {
		this.isDisconnected = true;
	}

	observe(_target: Element, options?: ResizeObserverOptions): void {
		if (FakeResizeObserver.refusesDeviceBox && options?.box === 'device-pixel-content-box') {
			throw new TypeError('No device-pixel-content-box, as in WebKit');
		}
	}

	report(css: [number, number], device?: [number, number]): void {
		const entry = {
			contentBoxSize: boxSize(css),
			...(device ? { devicePixelContentBoxSize: boxSize(device) } : {}),
		};

		this.#report([entry as unknown as ResizeObserverEntry]);
	}

	unobserve(): void {
		// Nothing observed to drop
	}
}

export class FakeIntersectionObserver {
	static readonly instances: Array<FakeIntersectionObserver> = [];

	isDisconnected = false;

	readonly #report: Report<IntersectionObserverEntry>;

	constructor(report: Report<IntersectionObserverEntry>) {
		this.#report = report;
		FakeIntersectionObserver.instances.push(this);
	}

	disconnect(): void {
		this.isDisconnected = true;
	}

	observe(): void {
		// Reports only when a test says so
	}

	report(isIntersecting: boolean): void {
		this.#report([{ isIntersecting } as IntersectionObserverEntry]);
	}
}

function ignore(): void {
	// Calls the surface makes that a test never reads
}

export function installCanvasFakes({ isReducedMotion = false } = {}): {
	flushFrames: (frameMs?: number) => void;
	queries: Array<EventTarget & { media: string }>;
} {
	const frames = new Map<number, FrameRequestCallback>();
	const queries: Array<EventTarget & { media: string }> = [];
	const context = {
		beginPath: ignore,
		canvas: { height: 48 },
		clearRect: ignore,
		clip: ignore,
		closePath: ignore,
		createLinearGradient: () => ({ addColorStop: ignore }),
		fill: ignore,
		fillRect: ignore,
		fillStyle: '',
		globalAlpha: 1,
		lineTo: ignore,
		lineWidth: 1,
		moveTo: ignore,
		rect: ignore,
		restore: ignore,
		save: ignore,
		stroke: ignore,
		strokeStyle: '',
	};
	let frameId = 0;

	FakeResizeObserver.instances.length = 0;
	FakeResizeObserver.refusesDeviceBox = false;
	FakeIntersectionObserver.instances.length = 0;
	vi.stubGlobal('ResizeObserver', FakeResizeObserver);
	vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
	vi.stubGlobal(
		'Path2D',
		class {
			roundRect(): void {
				// Bar geometry is tested through `stripBars`
			}
		},
	);
	vi.stubGlobal('matchMedia', (media: string) => {
		const query = Object.assign(new EventTarget(), {
			matches: isReducedMotion && media.includes('reduced-motion'),
			media,
		});

		queries.push(query);

		return query;
	});
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
		frameId += 1;
		frames.set(frameId, callback);

		return frameId;
	});
	vi.stubGlobal('cancelAnimationFrame', (id: number) => {
		frames.delete(id);
	});
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
		context as unknown as CanvasRenderingContext2D,
	);

	return {
		flushFrames: (frameMs = 0) => {
			const due = [...frames.values()];

			frames.clear();
			for (const callback of due) callback(frameMs);
		},
		queries,
	};
}
