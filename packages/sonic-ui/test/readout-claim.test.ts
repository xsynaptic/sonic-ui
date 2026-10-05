import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ReadoutClaim } from '#elements/readout-claim.ts';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
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
