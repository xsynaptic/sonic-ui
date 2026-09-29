import type { SonicDial, SonicNumber, SonicSlider } from '@xsynaptic/sonic-ui';

interface Format {
	format: (value: number) => string;
	parse?: (text: string) => number;
}

const filterTypes = ['LP', 'BP', 'HP', 'Notch'];

function parseNumber(text: string): number {
	// eslint-disable-next-line unicorn/prefer-number-coercion -- reads the number off the front of "5 kHz", where `Number` gives NaN
	return Number.parseFloat(text.replace('−', '-'));
}

function parseScaled(text: string, unit: RegExp, scale: number): number {
	const value = parseNumber(text);

	return unit.test(text) ? value * scale : value;
}

const formats = new Map<string, Format>([
	['bpm', { format: (value) => `${value.toFixed(1)} BPM`, parse: parseNumber }],
	['db', { format: (value) => `${value.toFixed(1).replace('-', '−')} dB`, parse: parseNumber }],
	['degrees', { format: (value) => `${String(value)}°`, parse: parseNumber }],
	[
		'filter',
		{
			format: (value) => filterTypes[value] ?? String(value),
			parse: (text) => {
				const index = filterTypes.findIndex(
					(name) => name.toLowerCase() === text.trim().toLowerCase(),
				);

				return index === -1 ? NaN : index;
			},
		},
	],
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
