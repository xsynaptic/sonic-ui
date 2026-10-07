interface Press {
	time: number;
	x: number;
	y: number;
}

export interface DoublePress {
	forget(): void;
	press(event: PointerEvent): boolean;
}

// Not `dblclick`, which iOS may not deliver under `touch-action: none`
const doublePressMs = 500;
const doublePressPx = 4;

function isDoublePress(previous: Press | undefined, next: Press): boolean {
	if (!previous) return false;

	return (
		next.time - previous.time < doublePressMs &&
		Math.hypot(next.x - previous.x, next.y - previous.y) < doublePressPx
	);
}

export function createDoublePress(): DoublePress {
	let last: Press | undefined;

	return {
		forget() {
			last = undefined;
		},
		press(event) {
			const press = { time: event.timeStamp, x: event.clientX, y: event.clientY };
			const previous = last;

			last = press;
			if (!isDoublePress(previous, press)) return false;

			last = undefined;

			return true;
		},
	};
}
