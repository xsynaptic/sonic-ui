import { readPxProperty } from '#lib/read-px-property.ts';

interface MarkerLook {
	dimmed?: boolean;
	end?: number;
	kind?: string;
}

interface MarkerBand {
	reachPx: () => number;
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

function renderMarker(marker: MarkerLook, [from, to]: [number, number]): HTMLElement {
	const part = document.createElement('div');

	part.className = marker.end === undefined ? 'sonic-wavestrip-marker' : 'sonic-wavestrip-region';
	part.style.setProperty('--_sonic-marker-from', String(from));
	part.style.setProperty('--_sonic-marker-to', String(to));
	writeKind(part, marker.kind, '--_sonic-marker-default');
	if (marker.dimmed === true) part.dataset.sonicDimmed = '';

	return part;
}

export function createMarkerBand(band: HTMLElement): MarkerBand {
	return {
		reachPx: () =>
			readPxProperty(getComputedStyle(band), '--_sonic-marker-size', 0) / 2 + snapSlopPx,
		render: (markers, proportions) => {
			band.replaceChildren(
				...markers.map((marker, index) => renderMarker(marker, proportions[index] ?? [0, 0])),
			);
		},
	};
}

export function nearestMarker(
	proportion: number,
	markerProportions: ReadonlyArray<number>,
	reach: number,
): number | undefined {
	let nearest: number | undefined;
	let nearestDistance = reach;

	for (const [index, markerProportion] of markerProportions.entries()) {
		const distance = Math.abs(markerProportion - proportion);
		if (distance > nearestDistance) continue;

		nearest = index;
		nearestDistance = distance;
	}

	return nearest;
}
