import { readPxProperty } from '#lib/read-px-property.ts';

type PrivateProperty = `--_sonic-${string}`;

export interface SurfaceSize {
	dpr: number;
	height: number;
	width: number;
}

export interface SurfaceLook<
	Colour extends string,
	Length extends string = never,
	Numeric extends string = never,
> {
	colours: Record<Colour, string>;
	isReducedMotion: boolean;
	lengths: Record<Length, number>;
	numbers: Record<Numeric, number>;
}

export interface SurfaceFrame<
	Colour extends string,
	Length extends string = never,
	Numeric extends string = never,
> {
	frameMs: number;
	isDirty: boolean;
	isRebuilt: boolean;
	look: SurfaceLook<Colour, Length, Numeric>;
	size: SurfaceSize;
}

export interface Surface {
	invalidate: () => void;
	readonly isVisible: boolean;
	rebuild: () => void;
	requestFrame: () => void;
	setFill: (isFilling: boolean) => void;
	readonly size: SurfaceSize;
}

interface SurfaceOptions<Colour extends string, Length extends string, Numeric extends string> {
	canvas: HTMLCanvasElement;
	colours: Record<Colour, PrivateProperty>;
	fill?: { control: HTMLElement; sizeProperty: PrivateProperty };
	lengths?: Record<Length, PrivateProperty>;
	numbers?: Record<Numeric, PrivateProperty>;
	paint: (context: CanvasRenderingContext2D, frame: SurfaceFrame<Colour, Length, Numeric>) => void;
	resize?: (size: SurfaceSize) => void;
	signal: AbortSignal;
}

interface ControlSurfaceOptions<
	Colour extends string,
	Length extends string,
	Numeric extends string,
> extends Omit<SurfaceOptions<Colour, Length, Numeric>, 'fill'> {
	control: HTMLElement;
	fill: boolean;
	sizeProperty: PrivateProperty;
}

function deviceRatio(): number {
	return globalThis.devicePixelRatio || 1;
}

// WebKit reports none, and an emulated device scale reports it in CSS px, so it counts only where it agrees
function deviceBox(
	entry: ResizeObserverEntry,
	css: ResizeObserverSize,
): ResizeObserverSize | undefined {
	const device =
		'devicePixelContentBoxSize' in entry ? entry.devicePixelContentBoxSize[0] : undefined;
	const dpr = deviceRatio();
	if (!device || Math.abs(device.inlineSize - css.inlineSize * dpr) > 1) return undefined;

	return Math.abs(device.blockSize - css.blockSize * dpr) > 1 ? undefined : device;
}

function canTakeColour(context: CanvasRenderingContext2D, colour: string): boolean {
	const kept = context.fillStyle;
	const isKept = (sentinel: string): boolean => {
		context.fillStyle = sentinel;
		context.fillStyle = colour;

		return context.fillStyle === sentinel;
	};
	const isRefused = isKept('#000000') && isKept('#ffffff');

	context.fillStyle = kept;

	return !isRefused;
}

// `Object.fromEntries` widens the keys to `string`
function readEach<Name extends string, Value>(
	properties: Partial<Record<Name, PrivateProperty>>,
	read: (property: PrivateProperty) => Value,
): Record<Name, Value> {
	const named: Readonly<Record<string, PrivateProperty | undefined>> = properties;

	return Object.fromEntries(
		Object.entries(named).flatMap(([name, property]) =>
			property === undefined ? [] : [[name, read(property)]],
		),
	) as Record<Name, Value>;
}

class CanvasSurface<
	Colour extends string,
	Length extends string,
	Numeric extends string,
> implements Surface {
	get isVisible(): boolean {
		return this.#isVisible;
	}

	get size(): SurfaceSize {
		return this.#size;
	}

	// happy-dom has no canvas context
	readonly #context: CanvasRenderingContext2D | undefined;

	#cssBox: undefined | { height: number; width: number };

	#fillWatch: ResizeObserver | undefined;

	#frame: number | undefined;

	#isDirty = true;

	#isRebuildWanted = true;

	#isVisible = true;

	#look: SurfaceLook<Colour, Length, Numeric> | undefined;

	readonly #options: SurfaceOptions<Colour, Length, Numeric>;

	readonly #reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

	#size: SurfaceSize = { dpr: deviceRatio(), height: 0, width: 0 };

	constructor(options: SurfaceOptions<Colour, Length, Numeric>) {
		const { canvas, signal } = options;

		this.#options = options;
		this.#context = canvas.getContext('2d') ?? undefined;
		this.#armTransitions();
		this.#observeSize();
		this.#observeView();
		this.#watchResolution();
		this.#reducedMotion.addEventListener(
			'change',
			() => {
				this.rebuild();
			},
			{ signal },
		);
		// `transitionstart` drops events when a change replaces a pending transition in WebKit
		canvas.addEventListener(
			'transitionrun',
			() => {
				this.rebuild();
			},
			{ signal },
		);
		signal.addEventListener(
			'abort',
			() => {
				if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
				this.#frame = undefined;
				this.#stopFill();
			},
			{ once: true },
		);
		this.#schedule();
	}

	invalidate(): void {
		this.#isDirty = true;
		this.#schedule();
	}

	rebuild(): void {
		this.#isRebuildWanted = true;
		this.invalidate();
	}

	requestFrame(): void {
		this.#schedule();
	}

	setFill(isFilling: boolean): void {
		const { fill, signal } = this.#options;
		if (!fill || signal.aborted || isFilling === (this.#fillWatch !== undefined)) return;

		const { style } = fill.control;

		this.#stopFill();
		if (!isFilling) {
			style.removeProperty(fill.sizeProperty);
			return;
		}

		const started = new ResizeObserver((entries) => {
			const box = entries.at(-1)?.borderBoxSize[0];
			if (!box) return;

			// Written a frame on, or the canvas resizes inside this delivery and WebKit reports a loop
			requestAnimationFrame(() => {
				if (this.#fillWatch === started) {
					style.setProperty(fill.sizeProperty, `${String(box.blockSize)}px`);
				}
			});
		});

		this.#fillWatch = started;
		started.observe(fill.control);
	}

	#armTransitions(): void {
		const { canvas, colours, numbers = {} } = this.#options;
		const { style } = canvas;
		// A colour mixed from `currentcolor` computes to the same text whatever `color` is
		const watched = ['color', ...Object.values(colours), ...Object.values(numbers)];

		style.setProperty('transition-property', watched.join(', '));
		style.setProperty('transition-duration', '0.001ms');
		style.setProperty('transition-timing-function', 'step-start');
		style.setProperty('transition-behavior', 'allow-discrete');
	}

	#current(): { isRebuilt: boolean; look: SurfaceLook<Colour, Length, Numeric> } {
		if (this.#look && !this.#isRebuildWanted) return { isRebuilt: false, look: this.#look };

		return { isRebuilt: true, look: this.#read() };
	}

	#draw(frameMs: number): void {
		this.#frame = undefined;

		const size = this.#size;
		if (size.width === 0 || size.height === 0) return;

		const { canvas, paint } = this.#options;
		const { isRebuilt, look } = this.#current();
		const isDirty = this.#isDirty;

		this.#look = look;
		this.#isDirty = false;
		this.#isRebuildWanted = false;
		// Assigning either clears the canvas and its state
		if (canvas.width !== size.width) canvas.width = size.width;
		if (canvas.height !== size.height) canvas.height = size.height;
		if (this.#context) paint(this.#context, { frameMs, isDirty, isRebuilt, look, size });
	}

	#measure(entry: ResizeObserverEntry): void {
		const [box] = entry.contentBoxSize;
		if (!box) return;

		const device = deviceBox(entry, box);

		if (device) {
			this.#cssBox = undefined;
			this.#resize(device.inlineSize, device.blockSize);
			return;
		}

		this.#cssBox = { height: box.blockSize, width: box.inlineSize };
		this.#rescale();
	}

	#observeSize(): void {
		const { canvas, signal } = this.#options;
		const observer = new ResizeObserver((entries) => {
			const entry = entries.at(-1);

			if (entry) this.#measure(entry);
		});

		try {
			observer.observe(canvas, { box: 'device-pixel-content-box' });
		} catch {
			// WebKit throws a TypeError on the option
			observer.observe(canvas, { box: 'content-box' });
		}
		signal.addEventListener(
			'abort',
			() => {
				observer.disconnect();
			},
			{ once: true },
		);
	}

	#observeView(): void {
		const { canvas, signal } = this.#options;
		const observer = new IntersectionObserver((entries) => {
			const entry = entries.at(-1);
			if (!entry) return;

			const wasVisible = this.#isVisible;

			this.#isVisible = entry.isIntersecting;
			if (!entry.isIntersecting && this.#frame !== undefined) {
				cancelAnimationFrame(this.#frame);
				this.#frame = undefined;
			}

			// Chromium fires no transition inside a skipped `content-visibility` subtree
			if (!wasVisible && entry.isIntersecting) this.rebuild();
		});

		observer.observe(canvas);
		signal.addEventListener(
			'abort',
			() => {
				observer.disconnect();
			},
			{ once: true },
		);
	}

	#read(): SurfaceLook<Colour, Length, Numeric> {
		const { canvas, colours, lengths = {}, numbers = {} } = this.#options;
		const styles = getComputedStyle(canvas);

		return {
			colours: readEach(colours, (property) =>
				this.#resolve(
					styles
						.getPropertyValue(property)
						.trim()
						.replaceAll('currentcolor', () => styles.color),
				),
			),
			isReducedMotion: this.#reducedMotion.matches,
			lengths: readEach<Length, number>(lengths, (property) => readPxProperty(styles, property, 0)),
			numbers: readEach<Numeric, number>(numbers, (property) =>
				readPxProperty(styles, property, 0),
			),
		};
	}

	#rescale(): void {
		const box = this.#cssBox;
		if (!box) {
			this.#resize(this.#size.width, this.#size.height);
			return;
		}

		const dpr = deviceRatio();

		this.#resize(Math.round(box.width * dpr), Math.round(box.height * dpr));
	}

	#resize(width: number, height: number): void {
		const previous = this.#size;
		const dpr = deviceRatio();
		if (previous.width === width && previous.height === height && previous.dpr === dpr) return;

		this.#size = { dpr, height, width };
		this.#options.resize?.(this.#size);
		if (previous.width === 0 || previous.height === 0) this.rebuild();
		else this.invalidate();
	}

	#resolve(colour: string): string {
		const context = this.#context;
		if (!context || canTakeColour(context, colour)) return colour;

		const probe = document.createElement('span');

		probe.style.color = colour;
		this.#options.canvas.append(probe);

		const resolved = getComputedStyle(probe).color;

		probe.remove();

		return resolved;
	}

	#schedule(): void {
		if (this.#options.signal.aborted || this.#frame !== undefined || !this.#isVisible) return;

		this.#frame = requestAnimationFrame((frameMs) => {
			this.#draw(frameMs);
		});
	}

	#stopFill(): void {
		this.#fillWatch?.disconnect();
		this.#fillWatch = undefined;
	}

	#watchResolution(): void {
		const { signal } = this.#options;

		matchMedia(`(resolution: ${String(deviceRatio())}dppx)`).addEventListener(
			'change',
			() => {
				this.#watchResolution();
				this.#rescale();
			},
			{ once: true, signal },
		);
	}
}

export function bindSurface<
	Colour extends string,
	Length extends string = never,
	Numeric extends string = never,
>(options: SurfaceOptions<Colour, Length, Numeric>): Surface {
	return new CanvasSurface(options);
}

export function bindControlSurface<
	Colour extends string,
	Length extends string = never,
	Numeric extends string = never,
>(options: ControlSurfaceOptions<Colour, Length, Numeric>): Surface {
	const { control, fill, sizeProperty, ...surfaceOptions } = options;
	const surface = bindSurface({ ...surfaceOptions, fill: { control, sizeProperty } });

	surface.setFill(fill);

	return surface;
}
