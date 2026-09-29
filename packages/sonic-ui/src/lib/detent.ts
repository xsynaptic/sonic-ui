// Places run 0 to 1 along the travel; `slack` is how far past the detent the pointer has pushed, set while held
export interface DetentHold {
	place: number;
	slack: number | undefined;
	value: number;
	zone: number;
}

function isAcross(from: number, to: number, place: number): boolean {
	return from !== place && (from - place) * (to - place) <= 0;
}

// The next place along the travel, or `undefined` while the detent holds
export function passDetent(hold: DetentHold, from: number, to: number): number | undefined {
	if (hold.slack === undefined && !isAcross(from, to, hold.place)) return to;

	// Held, `from` is the detent's place, so the move adds to the slack
	const slack = (hold.slack ?? 0) + to - hold.place;

	if (Math.abs(slack) <= hold.zone) {
		hold.slack = slack;
		return undefined;
	}

	hold.slack = undefined;

	return hold.place + slack - Math.sign(slack) * hold.zone;
}
