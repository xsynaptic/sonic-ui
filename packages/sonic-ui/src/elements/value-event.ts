export type ValueReason = 'arrow' | 'drag' | 'entry' | 'key' | 'reset' | 'spring' | 'tap';

export class SonicValueEvent extends Event {
	readonly reason: ValueReason;

	constructor(type: 'change' | 'input', reason: ValueReason) {
		super(type, { bubbles: true, composed: type === 'input' });
		this.reason = reason;
	}
}

// A move with no gesture behind it, as a split member's after a script's write, gets a plain `Event`
export function valueEvent(type: 'change' | 'input', reason: undefined | ValueReason): Event {
	if (reason) return new SonicValueEvent(type, reason);

	return new Event(type, { bubbles: true, composed: type === 'input' });
}

export function reasonOf(event: Event): undefined | ValueReason {
	return event instanceof SonicValueEvent ? event.reason : undefined;
}
