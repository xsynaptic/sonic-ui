import { readPxProperty } from '#lib/read-px-property.ts';

interface MarkerLook {
	dimmed?: boolean;
	end?: number;
	kind?: string;
}

interface Point {
	x: number;
	y: number;
}

interface MarkerBand {
	at: (point: Point, widthPx: number) => number | undefined;
	render: (
		markers: ReadonlyArray<MarkerLook>,
		proportions: ReadonlyArray<[number, number]>,
	) => void;
}

// Interpolated into a style, so anything else falls back to the default colour
const kindPattern = /^[a-z][a-z0-9-]*$/;

const snapSlopPx = 4;

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

function renderMarker(
	marker: MarkerLook,
	[from, to]: [number, number],
	lane: number | undefined,
): HTMLElement {
	const part = document.createElement('div');

	part.className = lane === undefined ? 'sonic-wavestrip-region' : 'sonic-wavestrip-marker';
	if (lane !== undefined) part.style.setProperty('--_sonic-marker-lane', String(lane));
	part.style.setProperty('--_sonic-marker-from', String(from));
	part.style.setProperty('--_sonic-marker-to', String(to));
	writeKind(part, marker.kind, '--_sonic-marker-default');
	if (marker.dimmed === true) part.dataset.sonicDimmed = '';

	return part;
}

export function createMarkerBand(band: HTMLElement): MarkerBand {
	let dots: Array<{ at: number; index: number; lane: number }> = [];

	const px = (property: string): number => readPxProperty(getComputedStyle(band), property, 0);

	return {
		at: ({ x, y }, widthPx) => {
			const size = px('--_sonic-marker-size');
			const step = px('--_sonic-marker-step');
			const nearest = nearestDot(
				{ x, y },
				dots.map(({ at, lane }) => ({ x: at * widthPx, y: size / 2 + lane * step })),
				size / 2 + snapSlopPx,
			);

			return nearest === undefined ? undefined : dots[nearest]?.index;
		},
		render: (markers, proportions) => {
			const widthPx = band.getBoundingClientRect().width;
			const points = markers.flatMap((marker, index) =>
				marker.end === undefined ? [{ at: proportions[index]?.[0] ?? 0, index }] : [],
			);
			const lanes = markerLanes(
				points.map(({ at }) => at * widthPx),
				px('--_sonic-marker-step'),
			);

			dots = points.map((point, order) => ({ ...point, lane: lanes[order] ?? 0 }));

			const laneOf = new Map(dots.map(({ index, lane }) => [index, lane]));

			band.replaceChildren(
				...markers.map((marker, index) =>
					renderMarker(marker, proportions[index] ?? [0, 0], laneOf.get(index)),
				),
			);
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

export function nearestDot(
	point: Point,
	dots: ReadonlyArray<Point>,
	reach: number,
): number | undefined {
	let nearest: number | undefined;
	let nearestDistance = reach * reach;

	for (const [index, dot] of dots.entries()) {
		const distance = (dot.x - point.x) ** 2 + (dot.y - point.y) ** 2;
		if (distance > nearestDistance) continue;

		nearest = index;
		nearestDistance = distance;
	}

	return nearest;
}
