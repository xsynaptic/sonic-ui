import { expect, test } from 'vitest';

import '#define/dial.ts';
import { formatPercent, parsePercent } from '#lib/percent.ts';

test.each(['50', '50%', ' 50 % '])('%j reads as 0.5', (text) => {
	expect(parsePercent(text)).toBe(0.5);
});

test.each(['', '  ', '%', 'loud', '5 0'])('%j reads as NaN', (text) => {
	expect(parsePercent(text)).toBeNaN();
});

test('every position of a 0.01 step survives a format and parse unchanged', () => {
	const dial = document.createElement('sonic-dial');

	dial.setAttribute('max', '1');
	dial.setAttribute('step', '0.01');
	document.body.replaceChildren(dial);

	for (let position = 0; position <= 100; position += 1) {
		dial.value = position / 100;

		const stepped = dial.value;

		expect(parsePercent(formatPercent(stepped))).toBe(stepped);
	}
});
