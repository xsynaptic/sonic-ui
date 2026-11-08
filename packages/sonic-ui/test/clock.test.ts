import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';

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

test.each([NaN, Infinity, -Infinity])('%j seconds writes as nothing', (seconds) => {
	expect(formatClock(seconds)).toBe('');
});

test.each([
	['83', 83],
	['1:23', 83],
	['1:02:05', 3725],
	[' 1:23 ', 83],
	['-0:49', -49],
	['−1:02:05', -3725],
	['1:2', 62],
	['1:23.5', 83.5],
	['1:05.25', 65.25],
])('%j reads as %j seconds', (text, seconds) => {
	expect(parseClock(text)).toBe(seconds);
});

test.each([
	'',
	'  ',
	'1:',
	':23',
	'1::05',
	'−',
	'abc',
	'1:ab',
	'1:-5',
	'--5',
	'−-5',
	'+5',
	'1:75',
	'1e2',
	'0x10',
	'1:.5',
	'1.5:30',
	'1:2:3:4',
	'Infinity',
])('%j reads as NaN', (text) => {
	expect(parseClock(text)).toBeNaN();
});

test.prop([fc.double({ max: 400_000, min: -400_000, noNaN: true })])(
	'a time the clock writes reads back as its whole seconds',
	(seconds) => {
		expect(parseClock(formatClock(seconds))).toBeCloseTo(Math.trunc(seconds), 9);
	},
);
