import { readPxProperty } from '#lib/read-px-property.ts';

interface MarkerLook {
	dimmed?: boolean;
	end?: number;
	kind?: string;
}

export interface Point {
	x: number;
	y: number;
}

interface MarkerBand<Marker extends MarkerLook> {
	inReach: (point: Point, widthPx: number) => Array<number>;
	render: (
		markers: ReadonlyArray<Marker>,
		proportions: ReadonlyArray<[number, number]>,
		draw?: (marker: Marker, part: HTMLElement) => void,
	) => void;
}

// Interpolated into a style, so anything else falls back to the default colour
const kindPattern = /^[a-z][a-z0-9-]*$/;

const snapMarginPx = 4;

export function isKind(kind: string | undefined): kind is string {
	return kind !== undefined && kindPattern.test(kind);
}

export function writeKind(part: HTMLElement, kind: string | undefined, fallback: string): void {
	if (!isKind(kind)) {
		part.style.removeProperty('--_sonic-marker');
		return;
	}

	part.style.setProperty('--_sonic-marker', `var(--sonic-marker-${kind}, var(${fallback}))`);
}

function createPart(marker: MarkerLook): HTMLElement {
	const part = document.createElement('div');

	part.className = marker.end === undefined ? 'sonic-wavestrip-marker' : 'sonic-wavestrip-region';
	writeKind(part, marker.kind, '--_sonic-marker-default');
	if (marker.dimmed === true) part.dataset.sonicDimmed = '';

	return part;
}

export function createMarkerBand<Marker extends MarkerLook>(band: HTMLElement): MarkerBand<Marker> {
	type Draw = (marker: Marker, part: HTMLElement) => void;

	let built:
		| undefined
		| { draw: Draw | undefined; markers: ReadonlyArray<Marker>; parts: Array<HTMLElement> };
	let placed: Array<{ at: number; index: number; lane: number }> = [];

	const px = (property: string): number => readPxProperty(getComputedStyle(band), property, 0);

	function build(markers: ReadonlyArray<Marker>, draw: Draw | undefined): Array<HTMLElement> {
		const parts = markers.map((marker) => {
			const part = createPart(marker);

			if (draw && marker.end === undefined) {
				part.style.setProperty('--_sonic-marker-paint', 'transparent');
				draw(marker, part);
			}

			return part;
		});

		band.replaceChildren(...parts);
		built = { draw, markers, parts };

		return parts;
	}

	return {
		inReach: (point, widthPx) => {
			const size = px('--_sonic-marker-size');
			const step = px('--_sonic-marker-step');

			return centersInReach(
				point,
				placed.map(({ at, lane }) => ({ x: at * widthPx, y: size / 2 + lane * step })),
				size / 2 + snapMarginPx,
			).flatMap((order) => placed[order]?.index ?? []);
		},
		render: (markers, proportions, draw) => {
			const widthPx = band.getBoundingClientRect().width;
			const points = markers.flatMap((marker, index) =>
				marker.end === undefined ? [{ at: proportions[index]?.[0] ?? 0, index }] : [],
			);
			const lanes = markerLanes(
				points.map(({ at }) => at * widthPx),
				px('--_sonic-marker-step'),
			);
			// A `markers` write always makes a new array, so the same array and renderer mean no write
			const parts =
				built?.markers === markers && built.draw === draw ? built.parts : build(markers, draw);

			placed = points.map((point, order) => ({ ...point, lane: lanes[order] ?? 0 }));
			for (const [index, part] of parts.entries()) {
				const [from, to] = proportions[index] ?? [0, 0];

				part.style.setProperty('--_sonic-marker-from', String(from));
				part.style.setProperty('--_sonic-marker-to', String(to));
			}
			for (const { index, lane } of placed) {
				parts[index]?.style.setProperty('--_sonic-marker-lane', String(lane));
			}
		},
	};
}

export function markerLanes(positions: ReadonlyArray<number>, minDistance: number): Array<number> {
	const lastInLane: Array<number> = [];

	return positions.map((position) => {
		const free = lastInLane.findIndex((last) => position - last >= minDistance);
		const lane = free === -1 ? lastInLane.length : free;

		lastInLane[lane] = position;

		return lane;
	});
}

// A later marker wins a tie, as it is drawn over the earlier one
export function centersInReach(
	point: Point,
	centers: ReadonlyArray<Point>,
	reach: number,
): Array<number> {
	return centers
		.map((center, index) => ({
			distance: (center.x - point.x) ** 2 + (center.y - point.y) ** 2,
			index,
		}))
		.filter(({ distance }) => distance <= reach * reach)
		.toSorted((first, second) => first.distance - second.distance || second.index - first.index)
		.map(({ index }) => index);
}
