import type { SonicDial, SonicNumber, SonicSlider } from '@xsynaptic/sonic-ui';

import { channelCurves, echoModes } from '#scripts/stop-names.ts';

interface Format {
	format: (value: number) => string;
	parse?: (text: string) => number;
}

const filterTypes = ['LP', 'BP', 'HP', 'Notch'];
// Ticks per whole note, so triplets and dotted notes stay whole numbers
const wholeTicks = 192;
const killDecibels = -60;

function parseNumber(text: string): number {
	// eslint-disable-next-line unicorn/prefer-number-coercion -- reads the number off the front of "5 kHz", where `Number` gives NaN
	return Number.parseFloat(text.replace('−', '-'));
}

function formatBeats(value: number): string {
	return value < 1 ? `1/${String(Math.round(1 / value))}` : String(value);
}

function parseBeats(text: string): number {
	const [numerator = NaN, denominator = 1] = text.split('/').map(Number);

	return numerator / denominator;
}

// Straight, dotted and triplet, each scaling the note's length by a ratio kept whole so the division stays exact
const noteKinds = [
	['', 1, 1],
	['D', 3, 2],
	['T', 2, 3],
] as const;

function formatNote(ticks: number): string {
	for (const [suffix, over, under] of noteKinds) {
		const denominator = (wholeTicks * over) / (ticks * under);

		if (Number.isSafeInteger(Math.log2(denominator))) return `1/${String(denominator)}${suffix}`;
	}

	return String(ticks);
}

function parseNote(text: string): number {
	const match = /^1\/(\d+)([dt])?$/i.exec(text.trim());
	if (!match) return NaN;

	const ticks = wholeTicks / Number(match[1]);
	const kind = match[2]?.toLowerCase();

	if (kind === 'd') return ticks * 1.5;

	return kind === 't' ? (ticks * 2) / 3 : ticks;
}

function formatDecibels(value: number): string {
	return `${value.toFixed(1).replace('-', '−')} dB`;
}

function namedStops(names: Array<string>): Format {
	return {
		format: (value) => names[value] ?? String(value),
		parse: (text) => {
			const index = names.findIndex((name) => name.toLowerCase() === text.trim().toLowerCase());

			return index === -1 ? NaN : index;
		},
	};
}

function parseScaled(text: string, unit: RegExp, scale: number): number {
	const value = parseNumber(text);

	return unit.test(text) ? value * scale : value;
}

const formats = new Map<string, Format>([
	['beats', { format: formatBeats, parse: parseBeats }],
	['bpm', { format: (value) => `${value.toFixed(1)} BPM`, parse: parseNumber }],
	['channel-curve', namedStops(channelCurves)],
	['db', { format: formatDecibels, parse: parseNumber }],
	[
		'db-kill',
		{
			format: (value) => (value <= killDecibels ? '−∞ dB' : formatDecibels(value)),
			parse: (text) => (/∞|inf/i.test(text) ? killDecibels : parseNumber(text)),
		},
	],
	['degrees', { format: (value) => `${String(value)}°`, parse: parseNumber }],
	['echo-mode', namedStops(echoModes)],
	['filter', namedStops(filterTypes)],
	[
		'hertz',
		{
			format: (value) =>
				value >= 1000
					? `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} kHz`
					: `${value < 10 ? value.toFixed(2) : String(Math.round(value))} Hz`,
			parse: (text) => parseScaled(text, /k/i, 1000),
		},
	],
	[
		'milliseconds',
		{
			format: (value) =>
				value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${String(Math.round(value))} ms`,
			parse: (text) => parseScaled(text.trim(), /^[^m]*s$/i, 1000),
		},
	],
	['note', { format: formatNote, parse: parseNote }],
	[
		'pan',
		{
			format: (value) => {
				if (value === 0) return 'C';

				return value < 0 ? `L${String(-value)}` : `R${String(value)}`;
			},
			parse: (text) => {
				const value = parseNumber(text.replace(/^[lr]/i, ''));

				return /^l/i.test(text.trim()) ? -value : value;
			},
		},
	],
	['percent', { format: (value) => `${String(value)}%`, parse: parseNumber }],
	[
		'semitones',
		{
			format: (value) => `${value > 0 ? '+' : ''}${String(value).replace('-', '−')} st`,
			parse: parseNumber,
		},
	],
	[
		'signed-percent',
		{ format: (value) => `${value > 0 ? '+' : ''}${String(value)}%`, parse: parseNumber },
	],
]);

for (const control of document.querySelectorAll<SonicDial | SonicNumber | SonicSlider>(
	'[data-format]',
)) {
	const format = formats.get(control.dataset.format ?? '');

	if (!format) {
		continue;
	}

	control.formatValue = format.format;
	control.parseValue = format.parse;
}
