import { writeKind } from '#lib/marker-band.ts';
import { clamp } from '#lib/math.ts';
import { readPxProperty } from '#lib/read-px-property.ts';
import { requireChild } from '#lib/render.ts';

interface RiderWindow {
	playheadSeconds: number;
	startSeconds: number;
	widthPx: number;
	windowSeconds: number;
}

export interface RiderView extends RiderWindow {
	fadeShare: number;
	insetPx: number;
}

export interface RiderLabel {
	isDimmed: boolean;
	kind?: string;
	start: number;
	text: string;
	widthPx: number;
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
	[view, arrivingX]: [RiderView, number],
): LabelPlacement | undefined {
	const parked = labels[index];
	if (!parked) return undefined;

	const next = labels[index + 1];
	const x = Math.max(view.insetPx, lineX(parked.start, view) + view.insetPx);
	const approachPx = next ? lineX(next.start, view) - lineX(view.playheadSeconds, view) : Infinity;

	return {
		index,
		opacity: view.fadeShare > 0 ? clamp(approachPx / (view.widthPx * view.fadeShare), 0, 1) : 1,
		shownPx: Math.min(parked.widthPx, arrivingX - x, view.widthPx - x),
		x,
	};
}

function isDrawable(length: number): boolean {
	return Number.isFinite(length) && length > 0;
}

export function layoutRider(labels: ReadonlyArray<RiderLabel>, view: RiderView): RiderLayout {
	if (!isDrawable(view.windowSeconds) || !isDrawable(view.widthPx)) return {};

	const parkedIndex = labels.findLastIndex((label) => label.start <= view.playheadSeconds);
	const next = labels[parkedIndex + 1];
	const arrivingX = next ? lineX(next.start, view) + view.insetPx : Infinity;
	const parked = parkedPlacement(labels, parkedIndex, [view, arrivingX]);
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
	return { element, kind: undefined, opacity: NaN, shownPx: NaN, x: NaN };
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

	if (element.textContent !== label.text) element.textContent = label.text;
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
	texts: Array<string>,
): Array<number> {
	const probes = texts.map((text) => {
		const probe = document.createElement('div');

		probe.className = className;
		probe.textContent = text;

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
		fadeProperty: `--_sonic-${string}`;
		insetProperty: `--_sonic-${string}`;
	},
): {
	measure: (labels: ReadonlyArray<Omit<RiderLabel, 'widthPx'>>) => void;
	place: (window: RiderWindow) => void;
} {
	const { className, colourProperty, fadeProperty, insetProperty } = options;
	const parked = labelSlot(requireChild(control, `.${className}`, HTMLElement));
	const arriving = labelSlot(requireChild(control, `.${className} + .${className}`, HTMLElement));
	let fadeShare = 0.25;
	let insetPx = 0;
	let measured: Array<RiderLabel> = [];

	return {
		measure: (labels) => {
			const widths = measureWidths(
				control,
				className,
				labels.map(({ text }) => text),
			);

			const styles = getComputedStyle(control);

			fadeShare = readPxProperty(styles, fadeProperty, 0.25);
			insetPx = readPxProperty(styles, insetProperty, 0);
			measured = labels
				.map((label, index) => ({ ...label, widthPx: widths[index] ?? 0 }))
				.toSorted((first, second) => first.start - second.start);
		},
		place: (window) => {
			const layout = layoutRider(measured, { ...window, fadeShare, insetPx });

			writeLabel(parked, [measured, colourProperty], layout.parked);
			writeLabel(arriving, [measured, colourProperty], layout.arriving);
		},
	};
}
