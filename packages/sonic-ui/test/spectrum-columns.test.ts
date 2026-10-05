import { expect, test } from 'vitest';

import {
	columnEdges,
	columnLevels,
	gridColumns,
	gridRows,
	levelRows,
	loudestBin,
	zoneRows,
} from '#lib/spectrum-columns.ts';

const axis = { binCount: 512, frequencyMax: 16_000, frequencyMin: 30, sampleRate: 44_100 };
const width = 331;
const floor = -72;

function columnsOf(levels: Record<number, number>, sampleRate = axis.sampleRate): Array<number> {
	const bins = new Float32Array(axis.binCount).fill(floor);
	const columns = new Float64Array(width);

	for (const [bin, level] of Object.entries(levels)) bins[Number(bin)] = level;
	columnLevels(columns, bins, { edges: columnEdges({ ...axis, sampleRate }, width), floor });

	return [...columns];
}

test('a column over several bins takes the loudest, and its neighbours none of them', () => {
	const columns = columnsOf({ 207: -40, 208: -10, 209: -30, 210: -50 });

	expect(columns.slice(299, 302)).toEqual([floor, -10, floor]);
});

test('a column between two bins interpolates in dB', () => {
	const columns = columnsOf({ 1: -20, 2: -40 });

	expect(columns[30]).toBeCloseTo(-24.849, 3);
});

test('a spike in one bin lands in the one column the log axis gives it', () => {
	const columns = columnsOf({ 256: -6 });
	const lit = columns.flatMap((level, column) => (level > floor ? [column] : []));

	expect(lit).toEqual([311]);
});

test('columns past Nyquist stay at the floor', () => {
	const everyBin = Object.fromEntries(
		Array.from({ length: axis.binCount }, (_bin, index) => [index, -10]),
	);
	const columns = columnsOf(everyBin, 22_050);

	expect(columns.slice(310, 314)).toEqual([-10, -10, floor, floor]);
});

test('a level maps to its row, and one outside the range to an end', () => {
	const rowOf = levelRows({ max: 6, min: -72 }, 157);

	expect([rowOf(-20), rowOf(12), rowOf(-100)]).toEqual([52, 0, 157]);
});

test.each([
	{ clipFrom: -3, expected: { clip: 6, hot: 12 }, hotFrom: -12, name: 'between rows' },
	{ clipFrom: 9, expected: { clip: 0, hot: 12 }, hotFrom: -12, name: 'with clip above the top' },
	{ clipFrom: -3, expected: { clip: 6, hot: 6 }, hotFrom: 0, name: 'with hot above clip' },
])('zone thresholds $name snap to whole rows', ({ clipFrom, expected, hotFrom }) => {
	const rowOf = levelRows({ max: 6, min: -72 }, 50);

	expect(zoneRows({ clipFrom, hotFrom }, rowOf)).toEqual(expected);
});

test('the grid has a line at each decade and each 12 dB strictly inside the ranges', () => {
	expect(gridColumns(axis, width)).toEqual([63, 185, 306]);
	expect(gridRows({ max: 6, min: -72 }, (level) => level)).toEqual([-60, -48, -36, -24, -12, 0]);
});

test('the loudest bin is found inside the frequency range only', () => {
	const frame = new Float32Array(axis.binCount).fill(-80);

	frame[0] = -1;
	frame[100] = -18;
	frame[400] = -2;

	expect(loudestBin(frame, axis)).toEqual({ decibels: -18, frequency: 4306.640625 });
});

test('a silent frame has no loudest bin', () => {
	expect(loudestBin(new Float32Array(axis.binCount).fill(-Infinity), axis)).toBeUndefined();
});
