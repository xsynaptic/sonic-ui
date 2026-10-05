import { linearTaper, logTaper } from '#lib/taper.ts';

export interface FrequencyAxis {
	binCount: number;
	frequencyMax: number;
	frequencyMin: number;
	sampleRate: number;
}

interface LevelRange {
	max: number;
	min: number;
}

const gridDecibels = 12;

function binHertz({ binCount, sampleRate }: FrequencyAxis): number {
	return sampleRate / 2 / binCount;
}

export function columnEdges(axis: FrequencyAxis, width: number): Float64Array {
	const edges = new Float64Array(width + 1);
	const taper = logTaper(axis.frequencyMin, axis.frequencyMax);
	if (!taper) return edges;

	const hertz = binHertz(axis);

	for (let edge = 0; edge <= width; edge += 1) edges[edge] = taper.valueAt(edge / width) / hertz;

	return edges;
}

export function columnLevels(
	columns: Float64Array,
	levels: ArrayLike<number>,
	{ edges, floor }: { edges: Float64Array; floor: number },
): void {
	const levelAt = (bin: number): number => (bin < levels.length ? (levels[bin] ?? floor) : floor);

	for (let column = 0; column < columns.length; column += 1) {
		const from = edges[column] ?? 0;
		const to = edges[column + 1] ?? from;
		const first = Math.ceil(from);
		const last = Math.ceil(to) - 1;

		if (first > last) {
			const below = levelAt(first - 1);

			columns[column] = below + (levelAt(first) - below) * ((from + to) / 2 - (first - 1));
			continue;
		}

		let loudest = floor;

		for (let bin = first; bin <= last && bin < levels.length; bin += 1) {
			loudest = Math.max(loudest, levelAt(bin));
		}
		columns[column] = loudest;
	}
}

export function levelRows({ max, min }: LevelRange, height: number): (level: number) => number {
	const taper = linearTaper(min, max);

	return (level) => Math.round((1 - taper.proportionOf(level)) * height);
}

export function gridColumns(
	{ frequencyMax, frequencyMin }: Pick<FrequencyAxis, 'frequencyMax' | 'frequencyMin'>,
	width: number,
): Array<number> {
	const taper = logTaper(frequencyMin, frequencyMax);
	const columns: Array<number> = [];
	if (!taper) return columns;

	for (
		let exponent = Math.floor(Math.log10(frequencyMin)) + 1;
		10 ** exponent < frequencyMax;
		exponent += 1
	) {
		columns.push(Math.round(taper.proportionOf(10 ** exponent) * width));
	}

	return columns;
}

export function gridRows(
	{ max, min }: LevelRange,
	rowOf: (level: number) => number,
): Array<number> {
	const rows: Array<number> = [];

	for (
		let level = (Math.floor(min / gridDecibels) + 1) * gridDecibels;
		level < max;
		level += gridDecibels
	) {
		rows.push(rowOf(level));
	}

	return rows;
}

export function zoneRows(
	{ clipFrom, hotFrom }: { clipFrom: number; hotFrom: number },
	rowOf: (level: number) => number,
): { clip: number; hot: number } {
	const clip = rowOf(clipFrom);

	return { clip, hot: Math.max(clip, rowOf(hotFrom)) };
}

export function loudestBin(
	frame: ArrayLike<number>,
	axis: FrequencyAxis,
): undefined | { decibels: number; frequency: number } {
	const hertz = binHertz(axis);
	const last = Math.min(Math.floor(axis.frequencyMax / hertz), frame.length - 1);
	let loudest = -1;
	let decibels = -Infinity;

	for (let bin = Math.ceil(axis.frequencyMin / hertz); bin <= last; bin += 1) {
		const level = frame[bin] ?? NaN;

		if (!(Number.isFinite(level) && level > decibels)) {
			continue;
		}

		loudest = bin;
		decibels = level;
	}

	return loudest === -1 ? undefined : { decibels, frequency: loudest * hertz };
}
