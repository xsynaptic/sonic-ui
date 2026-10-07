import { afterEach, expect, test } from 'vitest';

import {
	bindZoom,
	bindZoomKeys,
	pinchFactor,
	wheelFactor,
	zoomKeyFactor,
} from '#lib/zoom-gesture.ts';

import { pointerAt, pressKey } from './helpers.ts';

afterEach(() => {
	document.body.replaceChildren();
});

test('a wheel up by 10px zooms in by a tenth, and a line is 16px', () => {
	expect(wheelFactor(-10, 0)).toBeCloseTo(Math.exp(0.1), 12);
	expect(wheelFactor(-1, 1)).toBeCloseTo(Math.exp(0.16), 12);
});

test('a wheel notch is capped either way, and a key press undoes one', () => {
	expect(wheelFactor(120, 0)).toBeCloseTo(Math.exp(-0.25), 12);
	expect(wheelFactor(-3, 1)).toBeCloseTo(Math.exp(0.25), 12);
	expect(wheelFactor(120, 0) * zoomKeyFactor).toBeCloseTo(1, 12);
});

test('a pinch follows the ratio of the spans, whichever finger is on the left', () => {
	expect(pinchFactor(100, 150)).toBeCloseTo(1.5, 12);
	expect(pinchFactor(-100, 50)).toBeCloseTo(0.5, 12);
});

test('a span under 16px counts as 16px at either end of a pinch', () => {
	expect(pinchFactor(4, 64)).toBe(4);
	expect(pinchFactor(64, -2)).toBe(0.25);
});

function mountZoom(isZoomable = true): {
	claims: () => number;
	control: HTMLElement;
	controller: AbortController;
	gesture: ReturnType<typeof bindZoom>;
	state: { isDisabled: boolean; isZoomable: boolean };
	zooms: Array<number>;
} {
	const control = document.createElement('div');
	const controller = new AbortController();
	const state = { isDisabled: false, isZoomable };
	const zooms: Array<number> = [];
	let claims = 0;

	document.body.replaceChildren(control);

	const target = {
		claim: () => {
			claims += 1;
		},
		isDisabled: () => state.isDisabled,
		isZoomable: () => state.isZoomable,
		zoom: () => zooms.at(-1) ?? 60,
		zoomTo: (zoom: number) => {
			zooms.push(zoom);
		},
	};
	const gesture = bindZoom(control, target, controller.signal);

	bindZoomKeys(control, target, controller.signal);

	return { claims: () => claims, control, controller, gesture, state, zooms };
}

// happy-dom's WheelEvent is a UIEvent and drops the modifier keys from its init
function wheelAt(control: HTMLElement, init: WheelEventInit): WheelEvent {
	const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });

	Object.defineProperties(event, {
		ctrlKey: { value: init.ctrlKey === true },
		metaKey: { value: init.metaKey === true },
	});
	control.dispatchEvent(event);

	return event;
}

function touchAt(control: HTMLElement, type: string, [pointerId, clientX]: [number, number]): void {
	pointerAt(control, type, { clientX, pointerId, pointerType: 'touch' });
}

function gestureAt(control: HTMLElement, type: string, scale: number): Event {
	const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), { scale });

	control.dispatchEvent(event);

	return event;
}

test('a wheel zooms only with Ctrl or Meta held, and a plain one is left to the page', () => {
	const { control, zooms } = mountZoom();

	expect(wheelAt(control, { deltaY: -10 }).defaultPrevented).toBe(false);
	expect(zooms).toEqual([]);

	expect(wheelAt(control, { ctrlKey: true, deltaY: -10 }).defaultPrevented).toBe(true);
	wheelAt(control, { deltaY: 10, metaKey: true });
	expect(zooms[0]).toBeCloseTo(60 * Math.exp(0.1), 9);
	expect(zooms[1]).toBeCloseTo(60, 9);
});

test('the wheel is heard only while zooming is on, as of the last sync, and never once disabled', () => {
	const { control, controller, gesture, state, zooms } = mountZoom(false);
	const isWheelTaken = (): boolean =>
		wheelAt(control, { ctrlKey: true, deltaY: -10 }).defaultPrevented;

	expect(isWheelTaken()).toBe(false);

	state.isZoomable = true;
	gesture.sync();
	expect(isWheelTaken()).toBe(true);

	state.isDisabled = true;
	expect(isWheelTaken()).toBe(false);

	state.isDisabled = false;
	controller.abort();
	gesture.sync();
	expect(isWheelTaken()).toBe(false);
	expect(zooms).toHaveLength(1);
});

test('a Safari gesture scales the zoom it started at, is cancelled, and gives way to a touch', () => {
	const { control, zooms } = mountZoom();

	gestureAt(control, 'gesturestart', 1);
	expect(gestureAt(control, 'gesturechange', 1.5).defaultPrevented).toBe(true);
	gestureAt(control, 'gesturechange', 2);
	expect(zooms).toEqual([90, 120]);

	touchAt(control, 'pointerdown', [1, 100]);
	expect(gestureAt(control, 'gesturechange', 3).defaultPrevented).toBe(false);
	expect(zooms).toHaveLength(2);
});

test('+, - and = step by a wheel notch; a modifier, another target or zooming off leaves the key alone', () => {
	const { control, state, zooms } = mountZoom();
	const child = document.createElement('input');

	control.append(child);

	expect(pressKey(control, '+').defaultPrevented).toBe(true);
	pressKey(control, '-');
	pressKey(control, '=');
	expect(zooms.map((zoom) => zoom / 60)).toEqual([
		zoomKeyFactor,
		expect.closeTo(1, 12),
		expect.closeTo(zoomKeyFactor, 12),
	]);

	for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
		const event = new KeyboardEvent('keydown', {
			bubbles: true,
			cancelable: true,
			key: '+',
			[modifier]: true,
		});

		control.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
	}
	expect(pressKey(child, '+').defaultPrevented).toBe(false);

	state.isZoomable = false;
	expect(pressKey(control, '+').defaultPrevented).toBe(false);
	expect(zooms).toHaveLength(3);
});

test('a second finger claims the gesture once, and the pinch follows either finger from where they are', () => {
	const { claims, control, gesture, zooms } = mountZoom();

	touchAt(control, 'pointerdown', [1, 200]);
	touchAt(control, 'pointermove', [1, 140]);
	expect([claims(), gesture.isPinching()]).toEqual([0, false]);

	touchAt(control, 'pointerdown', [2, 240]);
	expect([claims(), gesture.isPinching()]).toEqual([1, true]);

	touchAt(control, 'pointermove', [2, 290]);
	touchAt(control, 'pointermove', [1, 215]);
	expect(zooms).toEqual([90, 45]);
});

test('a third finger joins no pinch: it claims nothing and its moves zoom nothing', () => {
	const { claims, control, gesture, zooms } = mountZoom();

	touchAt(control, 'pointerdown', [1, 200]);
	touchAt(control, 'pointerdown', [2, 300]);
	touchAt(control, 'pointerdown', [3, 400]);
	touchAt(control, 'pointermove', [3, 900]);
	expect([claims(), gesture.isPinching()]).toEqual([1, true]);
	expect(zooms).toEqual([]);

	touchAt(control, 'pointermove', [2, 350]);
	expect(zooms).toEqual([90]);
});

test('a pinch that lost a finger is spent until every finger lifts', () => {
	const { claims, control, gesture, zooms } = mountZoom();

	touchAt(control, 'pointerdown', [1, 200]);
	touchAt(control, 'pointerdown', [2, 300]);
	touchAt(control, 'pointercancel', [2, 300]);
	touchAt(control, 'pointermove', [1, 80]);
	touchAt(control, 'pointerdown', [3, 300]);
	touchAt(control, 'pointermove', [3, 180]);
	expect([claims(), gesture.isPinching()]).toEqual([1, true]);
	expect(zooms).toEqual([]);

	touchAt(control, 'pointerup', [3, 180]);
	expect(gesture.isPinching()).toBe(true);

	touchAt(control, 'pointerup', [1, 80]);
	expect(gesture.isPinching()).toBe(false);
});

test('a mouse, a disabled control and zooming off each leave a second pointer alone', () => {
	const { claims, control, gesture, state } = mountZoom();
	const twoDown = (pointerType: string): void => {
		for (const pointerId of [1, 2]) {
			pointerAt(control, 'pointerdown', { clientX: pointerId * 100, pointerId, pointerType });
		}
		for (const pointerId of [1, 2]) pointerAt(control, 'pointerup', { pointerId, pointerType });
	};

	twoDown('mouse');
	state.isDisabled = true;
	twoDown('touch');
	state.isDisabled = false;
	state.isZoomable = false;
	twoDown('touch');
	expect([claims(), gesture.isPinching()]).toEqual([0, false]);

	state.isZoomable = true;
	twoDown('touch');
	expect(claims()).toBe(1);
});
