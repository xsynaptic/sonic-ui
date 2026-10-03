import { readPxProperty } from '#lib/read-px-property.ts';

interface MarkerLook {
	dimmed?: boolean;
	end?: number;
	kind?: string;
}

interface MarkerBand {
	reachPx: () => number;
	render: (markers: ReadonlyArray<MarkerLook>, places: ReadonlyArray<[number, number]>) => void;
}

// Interpolated into a style, so anything else falls back to the default colour
const kindPattern = /^[a-z][a-z0-9-]*$/;

const snapSlopPx = 4;

function renderMarker(marker: MarkerLook, [from, to]: [number, number]): HTMLElement {
	const part = document.createElement('div');

	part.className = marker.end === undefined ? 'sonic-wavestrip-marker' : 'sonic-wavestrip-span';
	part.style.setProperty('--_sonic-marker-from', String(from));
	part.style.setProperty('--_sonic-marker-to', String(to));
	if (marker.kind !== undefined && kindPattern.test(marker.kind)) {
		part.style.setProperty(
			'--_sonic-marker',
			`var(--sonic-cue-${marker.kind}, var(--_sonic-marker-default))`,
		);
	}
	if (marker.dimmed === true) part.dataset.sonicDimmed = '';

	return part;
}

export function createMarkerBand(band: HTMLElement): MarkerBand {
	return {
		reachPx: () =>
			readPxProperty(getComputedStyle(band), '--_sonic-marker-size', 0) / 2 + snapSlopPx,
		render: (markers, places) => {
			band.replaceChildren(
				...markers.map((marker, index) => renderMarker(marker, places[index] ?? [0, 0])),
			);
		},
	};
}

export function nearestMarker(
	place: number,
	markerPlaces: ReadonlyArray<number>,
	reach: number,
): number | undefined {
	let nearest: number | undefined;
	let nearestDistance = reach;

	for (const [index, markerPlace] of markerPlaces.entries()) {
		const distance = Math.abs(markerPlace - place);
		if (distance > nearestDistance) continue;

		nearest = index;
		nearestDistance = distance;
	}

	return nearest;
}
