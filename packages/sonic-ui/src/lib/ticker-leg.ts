import { clamp, clampProportion } from '#lib/math.ts';

export type TickerHeading = -1 | 1;

export interface TickerTravel {
	distance: number;
	hold: number;
	rate: number;
}

export interface TickerDeparture {
	from: number;
	heading: TickerHeading;
	hold?: number;
}

export interface TickerLeg {
	duration: number;
	from: number;
	heading: TickerHeading;
	hold: number;
	to: number;
}

export interface TickerFade {
	delay: number;
	duration: number;
	widths: [number, number];
}

const fadeApproach = 3;

export function tickerLeg(
	{ distance, hold: fullHold, rate }: TickerTravel,
	{ from, heading, hold = fullHold }: TickerDeparture,
): TickerLeg | undefined {
	if (!(distance > 0) || !(rate > 0)) return undefined;

	const start = clamp(from, 0, distance);
	const isAtEnd = start === (heading > 0 ? distance : 0);
	const isOutbound = isAtEnd ? heading < 0 : heading > 0;
	const to = isOutbound ? distance : 0;

	return {
		duration: (Math.abs(to - start) / rate) * 1000,
		from: start,
		heading: isOutbound ? 1 : -1,
		hold: Math.max(0, hold),
		to,
	};
}

export function legPosition(leg: TickerLeg, elapsed: number): number {
	return leg.from + (leg.to - leg.from) * clampProportion((elapsed - leg.hold) / leg.duration);
}

export function legDeparture(leg: TickerLeg, elapsed: number): Required<TickerDeparture> {
	return {
		from: legPosition(leg, elapsed),
		heading: leg.heading,
		hold: Math.max(0, leg.hold - elapsed),
	};
}

export function clippedEnds(position: number, distance: number): string | undefined {
	const ends = [...(position > 0 ? ['start'] : []), ...(position < distance ? ['end'] : [])];

	return ends.length > 0 ? ends.join(' ') : undefined;
}

export function fadeWidth(past: number, fade: number): number {
	return clamp(past / fadeApproach, 0, Math.max(0, fade));
}

function legFade(leg: TickerLeg, [pastFrom, pastTo]: [number, number], fade: number): TickerFade {
	const reach = Math.max(0, fade) * fadeApproach;
	const msPerPx = leg.duration / Math.abs(leg.to - leg.from);
	const from = Math.min(pastFrom, reach);
	const to = Math.min(pastTo, reach);

	return {
		delay: leg.hold + (pastFrom - from) * msPerPx,
		duration: Math.abs(to - from) * msPerPx,
		widths: [from / fadeApproach, to / fadeApproach],
	};
}

export function legFades(
	leg: TickerLeg,
	distance: number,
	fade: number,
): Record<'end' | 'start', TickerFade> {
	return {
		end: legFade(leg, [distance - leg.from, distance - leg.to], fade),
		start: legFade(leg, [leg.from, leg.to], fade),
	};
}
