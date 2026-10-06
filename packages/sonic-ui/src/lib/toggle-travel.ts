import { clamp } from '#lib/math.ts';

interface Well {
	length: number;
	start: number;
	thickness: number;
}

interface Grab {
	at: number;
	count: number;
	first: number;
	isOnCap: boolean;
	last: number;
	pointer: number;
	well: Well;
}

export interface ToggleTravel {
	first: number;
	last: number;
	origin: number;
	step: number;
}

export function travelFrom({ at, count, first, isOnCap, last, pointer, well }: Grab): ToggleTravel {
	const step = count < 2 ? 0 : (well.length - well.thickness) / (count - 1);
	const origin = isOnCap ? pointer - at * step : well.start + well.thickness / 2;

	return { first, last, origin, step };
}

export function positionAt({ first, last, origin, step }: ToggleTravel, pointer: number): number {
	if (step <= 0) return first;

	return clamp((pointer - origin) / step, first, last);
}
