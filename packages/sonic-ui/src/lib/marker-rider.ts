import { writeKind } from '#lib/marker-band.ts';
import { clamp } from '#lib/math.ts';
import { readPxProperty } from '#lib/read-px-property.ts';
import { requireChild } from '#lib/render.ts';

interface RiderWindow {
	isPaged: boolean;
	playheadSeconds: number;
	startSeconds: number;
	widthPx: number;
	windowSeconds: number;
}

export interface RiderView extends RiderWindow {
	fadeEnd: number;
	fadeStart: number;
	insetPx: number;
	parkPx: number;
}

export interface RiderLabel {
	isDimmed: boolean;
	kind?: string;
	start: number;
	text: string;
	widthPx: number;
	write?: (element: HTMLElement) => void;
}

interface LabelPlacement {
	index: number;
	opacity: number;
	shownPx: number;
	x: number;
}

interface RiderLayout {
	arriving?: LabelPlacement;
	parked?: LabelPlacement;
}

interface LabelSlot {
	element: HTMLElement;
	kind: string | undefined;
	label: RiderLabel | undefined;
	opacity: number;
	shownPx: number;
	x: number;
}

function lineX(seconds: number, view: RiderView): number {
	return ((seconds - view.startSeconds) / view.windowSeconds) * view.widthPx;
}

function parkedPlacement(
	labels: ReadonlyArray<RiderLabel>,
	index: number,
	[view, arrivingX, [startX, endX]]: [RiderView, number, [number, number]],
): LabelPlacement | undefined {
	const parked = labels[index];
	if (!parked) return undefined;

	const next = labels[index + 1];
	const x = Math.max(view.parkPx, lineX(parked.start, view) + view.insetPx);
	const fadePx = startX - endX;
	const leftPx = next ? lineX(next.start, view) - endX : Infinity;

	return {
		index,
		opacity: fadePx > 0 ? clamp(leftPx / fadePx, 0, 1) : 1,
		shownPx: Math.min(parked.widthPx, arrivingX - x, view.widthPx - x),
		x,
	};
}

function isDrawable(length: number): boolean {
	return Number.isFinite(length) && length > 0;
}

// Where the next line is as the fade starts and ends; 0 at the playhead, 1 with its label on the park
function fadeLines(view: RiderView): [number, number] {
	const playheadX = lineX(view.playheadSeconds, view);
	// Nothing rides in on a still page, so the label changes as the playhead crosses
	if (view.isPaged) return [playheadX, playheadX];

	const stretchPx = view.parkPx - view.insetPx - playheadX;

	return [
		playheadX + clamp(view.fadeStart, 0, 1) * stretchPx,
		playheadX + clamp(view.fadeEnd, 0, 1) * stretchPx,
	];
}

export function layoutRider(labels: ReadonlyArray<RiderLabel>, view: RiderView): RiderLayout {
	if (!isDrawable(view.windowSeconds) || !isDrawable(view.widthPx)) return {};

	const fade = fadeLines(view);
	const parkedIndex = labels.findLastIndex((label) => lineX(label.start, view) <= fade[1]);
	const next = labels[parkedIndex + 1];
	const arrivingX = next ? lineX(next.start, view) + view.insetPx : Infinity;
	const parked = parkedPlacement(labels, parkedIndex, [view, arrivingX, fade]);
	const arriving: LabelPlacement | undefined =
		next && arrivingX < view.widthPx
			? {
					index: parkedIndex + 1,
					opacity: 1,
					shownPx: Math.min(next.widthPx, view.widthPx - arrivingX),
					x: arrivingX,
				}
			: undefined;

	return { ...(arriving ? { arriving } : {}), ...(parked ? { parked } : {}) };
}

function labelSlot(element: HTMLElement): LabelSlot {
	return { element, kind: undefined, label: undefined, opacity: NaN, shownPx: NaN, x: NaN };
}

function writeContent(element: HTMLElement, { text, write }: Omit<RiderLabel, 'widthPx'>): void {
	element.textContent = write ? '' : text;
	write?.(element);
}

function writePlacement(
	slot: LabelSlot,
	{ opacity, shownPx, x }: LabelPlacement,
	widthPx: number,
): void {
	const { style } = slot.element;

	if (slot.x !== x) {
		slot.x = x;
		style.setProperty('translate', `${x.toFixed(2)}px`);
	}
	if (slot.shownPx !== shownPx) {
		slot.shownPx = shownPx;
		style.setProperty(
			'clip-path',
			shownPx < widthPx ? `inset(0 calc(100% - ${shownPx.toFixed(2)}px) 0 0)` : '',
		);
	}
	if (slot.opacity !== opacity) {
		slot.opacity = opacity;
		style.setProperty('opacity', opacity < 1 ? opacity.toFixed(3) : '');
	}
}

function writeLabel(
	slot: LabelSlot,
	[labels, colourProperty]: [ReadonlyArray<RiderLabel>, string],
	placement: LabelPlacement | undefined,
): void {
	const { element } = slot;
	const label = placement && placement.shownPx > 0 ? labels[placement.index] : undefined;

	if (element.hidden !== !label) element.hidden = !label;
	if (!label || !placement) return;

	if (slot.label !== label) {
		slot.label = label;
		writeContent(element, label);
	}
	element.toggleAttribute('data-sonic-dimmed', label.isDimmed);
	if (slot.kind !== label.kind) {
		slot.kind = label.kind;
		writeKind(element, label.kind, colourProperty);
	}
	writePlacement(slot, placement, label.widthPx);
}

function measureWidths(
	control: HTMLElement,
	className: string,
	labels: ReadonlyArray<Omit<RiderLabel, 'widthPx'>>,
): Array<number> {
	const probes = labels.map((label) => {
		const probe = document.createElement('div');

		probe.className = className;
		writeContent(probe, label);

		return probe;
	});

	control.append(...probes);

	const widths = probes.map((probe) => probe.getBoundingClientRect().width);

	for (const probe of probes) probe.remove();

	return widths;
}

export function createLabelRider(
	control: HTMLElement,
	options: {
		className: string;
		colourProperty: `--_sonic-${string}`;
		fadeProperties: [start: `--_sonic-${string}`, end: `--_sonic-${string}`];
		insetProperty: `--_sonic-${string}`;
		parkProperty: `--_sonic-${string}`;
	},
): {
	measure: (labels: ReadonlyArray<Omit<RiderLabel, 'widthPx'>>) => void;
	place: (window: RiderWindow) => void;
} {
	const { className, colourProperty, fadeProperties, insetProperty, parkProperty } = options;
	const parked = labelSlot(requireChild(control, `.${className}`, HTMLElement));
	const arriving = labelSlot(requireChild(control, `.${className} + .${className}`, HTMLElement));
	let fadeStart = 0;
	let fadeEnd = 1;
	let insetPx = 0;
	let parkPx = 0;
	let measured: Array<RiderLabel> = [];

	return {
		measure: (labels) => {
			const widths = measureWidths(control, className, labels);

			const styles = getComputedStyle(control);

			fadeStart = readPxProperty(styles, fadeProperties[0], 0);
			fadeEnd = readPxProperty(styles, fadeProperties[1], 1);
			insetPx = readPxProperty(styles, insetProperty, 0);
			parkPx = readPxProperty(styles, parkProperty, 0);
			measured = labels
				.map((label, index) => ({ ...label, widthPx: widths[index] ?? 0 }))
				.toSorted((first, second) => first.start - second.start);
		},
		place: (window) => {
			const layout = layoutRider(measured, { ...window, fadeEnd, fadeStart, insetPx, parkPx });

			writeLabel(parked, [measured, colourProperty], layout.parked);
			writeLabel(arriving, [measured, colourProperty], layout.arriving);
		},
	};
}
