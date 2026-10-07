import type { ValueMapping } from '#lib/value-mapping.ts';

export interface ScrubState {
	from: number | undefined;
	isRevealed: boolean;
	played: number;
}

export function scrubRegions(
	state: ScrubState,
	value: number,
	mapping: ValueMapping,
): { played: number; scrub: number | undefined } {
	const played = mapping.proportionOf(state.played);
	const reached = mapping.proportionOf(value);
	const isScrubbing = state.from !== undefined && state.isRevealed && reached !== played;

	return { played, scrub: isScrubbing ? reached : undefined };
}
