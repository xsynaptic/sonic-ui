import { expect, test } from 'vitest';

import { formatClock, parseClock } from '#lib/clock.ts';

test.each([
	[3725, '1:02:05'],
	[59.99, '0:59'],
	[83.47, '1:23'],
	[-49.8, '−0:49'],
	[-0.4, '−0:00'],
	[-3725, '−1:02:05'],
])('%j seconds writes as %j', (seconds, text) => {
	expect(formatClock(seconds)).toBe(text);
});

test.each([
	['83', 83],
	['1:23', 83],
	['1:02:05', 3725],
	[' 1:23 ', 83],
	['-0:49', -49],
	['−1:02:05', -3725],
])('%j reads as %j seconds', (text, seconds) => {
	expect(parseClock(text)).toBe(seconds);
});

test.each(['', '  ', '1:', ':23', '1::05', '−', 'abc', '1:ab'])('%j reads as NaN', (text) => {
	expect(parseClock(text)).toBeNaN();
});

test.each([0, 59, 60, 3599, 3600, 3725, -49, -3725])(
	'%j whole seconds survive a round trip',
	(seconds) => {
		expect(parseClock(formatClock(seconds))).toBe(seconds);
	},
);
