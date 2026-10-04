import '@xsynaptic/sonic-ui/define/dial';
import { expect, test } from 'vitest';

import { applyFormat } from '#scripts/formats.ts';
import { defineStops, echoModes } from '#scripts/stop-names.ts';

test('a stop set keeps each value at its label’s index', () => {
	const stops = defineStops([
		{ label: 'Low', value: 'low' },
		{ label: 'Mid', value: 'mid' },
		{ label: 'High', value: 'high' },
	]);

	expect(stops.labels).toEqual(['Low', 'Mid', 'High']);
	expect([0, 1, 2, 3].map((index) => stops.valueAt(index))).toEqual([
		'low',
		'mid',
		'high',
		undefined,
	]);
	expect(stops.positions).toBe('0 1 2');
});

test('a mode dial shows the label of the value the audio reads', () => {
	const dial = document.createElement('sonic-dial');

	dial.max = 3;
	document.body.append(dial);
	applyFormat(dial, 'echo-mode');

	const index = dial.parseValue?.('ping-PONG') ?? NaN;

	dial.value = index;
	expect(dial.valueText).toBe('Ping-pong');
	expect(echoModes.valueAt(dial.value)).toBe('ping-pong');
	expect(dial.parseValue?.('Reverse')).toBeNaN();
	dial.remove();
});
