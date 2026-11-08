import { bindDrag } from '#lib/pointer-drag.ts';

interface RepeatHandlers {
	press: (event: PointerEvent) => boolean;
	release: () => void;
	step: (steps: number) => boolean;
}

interface Hold {
	timer: ReturnType<typeof setTimeout> | undefined;
}

export interface RepeatPress {
	end: () => void;
}

const repeatDelayMs = 400;
const repeatEveryMs = 120;

const paces = [
	[0, 1],
	[1200, 2],
	[2400, 4],
	[3600, 8],
] as const;

function repeatMultiplier(heldMs: number): number {
	const [, steps] = paces.findLast(([fromMs]) => heldMs >= fromMs) ?? paces[0];

	return steps;
}

export function bindRepeatPress(
	target: HTMLElement,
	handlers: RepeatHandlers,
	signal: AbortSignal,
): RepeatPress {
	const repeatAfter = (hold: Hold, delayMs: number, heldMs: number): void => {
		if (drag.current() !== hold) return;

		hold.timer = setTimeout(() => {
			if (handlers.step(repeatMultiplier(heldMs))) {
				repeatAfter(hold, repeatEveryMs, heldMs + repeatEveryMs);
			}
		}, delayMs);
	};
	const drag = bindDrag<Hold>(
		target,
		{
			grab: (event) => (handlers.press(event) ? { timer: undefined } : undefined),
			release: (hold) => {
				clearTimeout(hold.timer);
				handlers.release();
			},
			// After the hold is registered, so a step whose `input` disables the control can end it
			toggle: (isHeld) => {
				const hold = drag.current();

				if (isHeld && hold && handlers.step(1)) repeatAfter(hold, repeatDelayMs, repeatDelayMs);
			},
		},
		signal,
	);

	// A long touch would open the callout or the menu over a hold
	target.addEventListener(
		'contextmenu',
		(event) => {
			event.preventDefault();
		},
		{ signal },
	);

	return { end: drag.end };
}
