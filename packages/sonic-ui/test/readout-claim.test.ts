import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ReadoutClaim } from '#elements/readout-claim.ts';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

test('a hover yields to a drag, and returns only when it hovers again', () => {
	const claim = new ReadoutClaim(vi.fn());

	claim.hover(12);
	expect(claim.shown(30, true)).toEqual({ isOpen: true, value: 12 });

	claim.reveal('drag');
	expect(claim.shown(55, true)).toEqual({ isOpen: true, value: 55 });

	claim.hover(14);
	claim.conceal('drag');
	expect(claim.shown(55, true)).toEqual({ isOpen: false, value: 55 });

	claim.hover(12);
	expect(claim.shown(55, true)).toEqual({ isOpen: true, value: 12 });
});

test('a key reveal lapses a second after the last press, once', () => {
	const onLapse = vi.fn();
	const claim = new ReadoutClaim(onLapse);

	claim.reveal('keys');
	vi.advanceTimersByTime(600);
	claim.reveal('keys');
	vi.advanceTimersByTime(600);
	expect(claim.isRevealed).toBe(true);

	vi.advanceTimersByTime(400);
	expect(claim.isRevealed).toBe(false);
	expect(onLapse).toHaveBeenCalledOnce();
});

test('concealing keys stops the lapse, and says whether a reveal was held', () => {
	const onLapse = vi.fn();
	const claim = new ReadoutClaim(onLapse);

	expect(claim.conceal('keys')).toBe(false);

	claim.reveal('keys');
	expect(claim.conceal('keys')).toBe(true);

	vi.runAllTimers();
	expect(onLapse).not.toHaveBeenCalled();
});

test('the entry outranks a reveal and hides the text, and a hover while it is open is dropped', () => {
	const claim = new ReadoutClaim(vi.fn());

	claim.reveal('drag');
	claim.edit(true);
	claim.hover(12);
	expect(claim.shown(30, false)).toEqual({ isOpen: true, value: undefined });

	claim.edit(false);
	claim.conceal('drag');
	expect(claim.shown(30, true)).toEqual({ isOpen: false, value: 30 });
});

test('without a readout a reveal stays closed, though it still counts as revealed', () => {
	const claim = new ReadoutClaim(vi.fn());

	claim.reveal('keys');
	expect(claim.shown(30, false)).toEqual({ isOpen: false, value: 30 });
	expect(claim.isRevealed).toBe(true);
});

test('opening the entry drops a hover, so closing it shows the value again', () => {
	const claim = new ReadoutClaim(vi.fn());

	claim.hover(12);
	claim.edit(true);
	claim.edit(false);

	expect(claim.shown(30, true)).toEqual({ isOpen: false, value: 30 });
});

test('a dismissed hover stays away until the pointer leaves and comes back', () => {
	const claim = new ReadoutClaim(vi.fn());

	expect(claim.dismiss()).toBe(false);

	claim.hover(12);
	expect(claim.dismiss()).toBe(true);
	expect(claim.shown(30, true)).toEqual({ isOpen: false, value: 30 });

	claim.hover(13);
	expect(claim.shown(30, true)).toEqual({ isOpen: false, value: 30 });

	claim.hover();
	claim.hover(14);
	expect(claim.shown(30, true)).toEqual({ isOpen: true, value: 14 });
});

test('a held press reveals after 250ms as a drag, and a release before then reveals nothing', () => {
	const onLapse = vi.fn();
	const claim = new ReadoutClaim(onLapse);

	claim.press(true);
	vi.advanceTimersByTime(249);
	expect(claim.isRevealed).toBe(false);

	vi.advanceTimersByTime(1);
	expect(claim.isRevealed).toBe(true);
	expect(onLapse).toHaveBeenCalledOnce();

	claim.press(false);
	expect(claim.isRevealed).toBe(false);
	expect(onLapse).toHaveBeenCalledTimes(2);

	claim.press(true);
	claim.press(false);
	vi.runAllTimers();
	expect(claim.isRevealed).toBe(false);
	expect(onLapse).toHaveBeenCalledTimes(3);
});
