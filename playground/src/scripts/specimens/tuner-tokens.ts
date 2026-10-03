interface TokenBase {
	from?: string;
	label: string;
	resolved?: string;
	token: string;
}

interface ColourToken extends TokenBase {
	kind: 'colour';
}

interface RangeToken extends TokenBase {
	kind: 'range';
	max: number;
	min: number;
	step: number;
	unit: '' | 'deg' | 'px' | 'rem';
}

// The first option is the baseline: the token left unset
interface ChoiceToken extends TokenBase {
	kind: 'choice';
	options: Array<{ label: string; value: string }>;
}

export type TunerToken = ChoiceToken | ColourToken | RangeToken;

interface TokenGroup {
	from: string;
	name: string;
	tokens: Array<TunerToken>;
}

function colour(
	label: string,
	token: string,
	options: Pick<TokenBase, 'from' | 'resolved'> = {},
): ColourToken {
	return { ...options, kind: 'colour', label, token };
}

function range(
	label: string,
	token: string,
	[min, max, step, unit = '']: [number, number, number, RangeToken['unit']?],
): RangeToken {
	return { kind: 'range', label, max, min, step, token, unit };
}

export function resolvedProperty(token: TunerToken): string {
	return token.resolved ?? token.token.replace('--sonic-', '--_sonic-');
}

export const tokenGroups: Array<TokenGroup> = [
	{
		from: '.sonic-dial',
		name: 'Material',
		tokens: [
			colour('lit', '--sonic-lit'),
			colour('unlit', '--sonic-unlit'),
			colour('cap', '--sonic-cap'),
			colour('cap hover', '--sonic-cap-hover'),
			colour('mark', '--sonic-mark', { resolved: '--_sonic-ink' }),
			colour('focus', '--sonic-focus'),
			colour('dimmed', '--sonic-dimmed', { resolved: '--_sonic-lit-off' }),
			colour('modulation', '--sonic-modulation', {
				from: '.sonic-dial-modulation',
				resolved: '--_sonic-dial-modulation',
			}),
			colour('glass', '--sonic-glass', { from: '.sonic-screen' }),
			colour('glass text', '--sonic-glass-text', { from: '.sonic-screen' }),
			{
				kind: 'choice',
				label: 'glass font',
				options: [
					{ label: 'inherit', value: '' },
					{ label: 'mono', value: 'ui-monospace, monospace' },
					{ label: 'serif', value: 'ui-serif, serif' },
					{ label: 'rounded', value: 'ui-rounded, system-ui' },
				],
				token: '--sonic-glass-font',
			},
			colour('lit alt', '--sonic-lit-alt', { from: '.sonic-key-cap > .sonic-led' }),
			colour('buffered', '--sonic-buffered', {
				from: '.sonic-slider',
				resolved: '--_sonic-slider-buffered',
			}),
			colour('cue', '--sonic-cue', {
				from: '.sonic-wavestrip',
				resolved: '--_sonic-marker-default',
			}),
			colour('hot', '--sonic-hot', { from: '.sonic-meter' }),
			colour('clip', '--sonic-clip', { from: '.sonic-meter' }),
			range('light tilt', '--sonic-light-tilt', [-60, 60, 1, 'deg']),
			range('detent zone', '--sonic-detent-zone', [0, 40, 1, 'px']),
			{
				...range('readout size', '--sonic-readout-size', [1, 3, 0.125, 'rem']),
				from: '.sonic-dial-readout',
			},
		],
	},
	{
		from: '.sonic-dial',
		name: 'Dial',
		tokens: [
			range('size', '--sonic-dial-size', [1.5, 8, 0.25, 'rem']),
			range('ring', '--sonic-dial-ring-ratio', [0, 0.25, 0.005]),
			range('gap', '--sonic-dial-gap-ratio', [0, 0.15, 0.005]),
			range('pointer', '--sonic-dial-pointer-ratio', [0.01, 0.15, 0.005]),
			range('pointer taper', '--sonic-dial-pointer-taper', [0, 1, 0.05]),
			range('face drift', '--sonic-dial-face-drift', [0, 0.5, 0.01]),
			range('sweep', '--sonic-dial-sweep', [180, 360, 5, 'deg']),
			range('segment', '--sonic-dial-segment', [5, 90, 1, 'deg']),
			range('notch', '--sonic-dial-notch-ratio', [0, 0.2, 0.005]),
			range('scale', '--sonic-dial-scale-ratio', [0, 0.4, 0.005]),
			range('scale font', '--sonic-dial-scale-font-ratio', [0.05, 0.4, 0.005]),
			range('ridge pitch', '--sonic-dial-ridge-pitch', [2, 12, 0.5, 'px']),
			range('travel', '--sonic-dial-travel', [40, 400, 10, 'px']),
		],
	},
	{
		from: '.sonic-key',
		name: 'Key',
		tokens: [
			range('size', '--sonic-key-size', [1.25, 6, 0.25, 'rem']),
			range('aspect', '--sonic-key-aspect-ratio', [1, 5, 0.1]),
			range('gap', '--sonic-key-gap-ratio', [0, 0.15, 0.005]),
			range('corner', '--sonic-key-radius-ratio', [0, 0.5, 0.01]),
			range('bevel', '--sonic-key-bevel-ratio', [0, 0.25, 0.005]),
			range('face corner', '--sonic-key-face-radius-ratio', [0, 0.5, 0.01]),
			range('icon', '--sonic-key-icon-ratio', [0.2, 0.8, 0.01]),
			range('led', '--sonic-key-led-ratio', [0.1, 0.4, 0.01]),
			range('icon with led', '--sonic-key-led-icon-ratio', [0.15, 0.6, 0.01]),
			range('depth', '--sonic-key-depth-ratio', [0, 0.1, 0.005]),
			range('press scale', '--sonic-key-press-scale', [0.85, 1, 0.005]),
		],
	},
	{
		from: '.sonic-slider',
		name: 'Slider',
		tokens: [
			range('size', '--sonic-slider-size', [1.25, 4, 0.25, 'rem']),
			range('length', '--sonic-slider-length', [4, 20, 0.5, 'rem']),
			range('groove', '--sonic-slider-groove-ratio', [0, 0.4, 0.005]),
			range('cap', '--sonic-slider-cap-ratio', [0.2, 1.5, 0.01]),
			range('corner', '--sonic-slider-radius-ratio', [0, 0.5, 0.01]),
			range('bevel', '--sonic-slider-bevel-ratio', [0, 0.25, 0.005]),
			range('pointer', '--sonic-slider-pointer-ratio', [0.01, 0.15, 0.005]),
			range('scale', '--sonic-slider-scale-ratio', [0, 1, 0.01]),
			range('scale font', '--sonic-slider-scale-font-ratio', [0.1, 0.6, 0.01]),
		],
	},
	{
		from: '.sonic-wavestrip',
		name: 'Wave strip',
		tokens: [
			range('size', '--sonic-wavestrip-size', [2, 6, 0.25, 'rem']),
			range('bar pitch', '--sonic-wavestrip-bar-pitch', [1, 8, 0.5, 'px']),
			range('gap', '--sonic-wavestrip-bar-gap-ratio', [0, 0.8, 0.01]),
			range('bar corner', '--sonic-wavestrip-bar-radius-ratio', [0, 0.5, 0.01]),
			range('marker', '--sonic-wavestrip-marker-ratio', [0.04, 0.3, 0.005]),
			colour('wave', '--sonic-wave', { resolved: '--_sonic-wavestrip-wave' }),
			colour('scrub', '--sonic-scrub', { resolved: '--_sonic-wavestrip-scrub' }),
			range('cancel zone', '--sonic-cancel-zone', [0, 120, 4, 'px']),
			range('glass depth', '--sonic-glass-depth', [0, 1, 0.05]),
			range('glass texture', '--sonic-glass-texture', [0, 1, 0.25]),
		],
	},
	{
		from: '.sonic-waveform',
		name: 'Waveform',
		tokens: [
			range('size', '--sonic-waveform-size', [3, 10, 0.25, 'rem']),
			range('length', '--sonic-waveform-length', [8, 24, 0.5, 'rem']),
		],
	},
	{
		from: '.sonic-segmented',
		name: 'Switch',
		tokens: [
			range('size', '--sonic-segmented-size', [1.25, 4, 0.25, 'rem']),
			range('gap', '--sonic-segmented-gap-ratio', [0, 0.2, 0.005]),
			range('corner', '--sonic-segmented-radius-ratio', [0, 0.5, 0.01]),
			range('bevel', '--sonic-segmented-bevel-ratio', [0, 0.25, 0.005]),
			range('depth', '--sonic-segmented-depth-ratio', [0, 0.1, 0.005]),
			range('press scale', '--sonic-segmented-press-scale', [0.85, 1, 0.005]),
			range('font', '--sonic-segmented-font-ratio', [0.15, 0.6, 0.01]),
			range('icon', '--sonic-segmented-icon-ratio', [0.2, 0.8, 0.01]),
		],
	},
	{
		from: '.sonic-lever',
		name: 'Lever',
		tokens: [
			range('size', '--sonic-lever-size', [1, 6, 0.25, 'rem']),
			range('reach', '--sonic-lever-reach-ratio', [0, 0.5, 0.01]),
			range('bat', '--sonic-lever-bat-ratio', [0.1, 0.6, 0.01]),
			range('bushing', '--sonic-lever-bushing-ratio', [0.2, 1, 0.01]),
			range('font', '--sonic-lever-font-ratio', [0.15, 0.8, 0.01]),
		],
	},
	{
		from: '.sonic-key-cap > .sonic-led',
		name: 'LED',
		tokens: [
			range('size', '--sonic-led-size', [0.25, 2, 0.0625, 'rem']),
			range('lens', '--sonic-led-lens-ratio', [0.3, 1, 0.01]),
		],
	},
	{
		from: '.sonic-ring',
		name: 'Ring',
		tokens: [
			range('ring', '--sonic-ring-ratio', [0, 0.25, 0.005]),
			range('gap', '--sonic-ring-gap-ratio', [0, 0.25, 0.005]),
			range('sweep', '--sonic-ring-sweep', [30, 360, 5, 'deg']),
		],
	},
	{
		from: '.sonic-xy',
		name: 'XY pad',
		tokens: [
			range('size', '--sonic-xy-size', [3, 16, 0.25, 'rem']),
			range('aspect', '--sonic-xy-aspect-ratio', [0.5, 3, 0.05]),
			range('puck', '--sonic-xy-puck-ratio', [0.05, 0.4, 0.005]),
			range('corner', '--sonic-xy-radius-ratio', [0, 0.5, 0.01]),
			range('inset', '--sonic-xy-inset-ratio', [0, 0.2, 0.005]),
		],
	},
	{
		from: '.sonic-envelope',
		name: 'Envelope',
		tokens: [
			range('size', '--sonic-envelope-size', [3, 10, 0.25, 'rem']),
			range('aspect', '--sonic-envelope-aspect-ratio', [1, 6, 0.1]),
			range('corner', '--sonic-envelope-radius-ratio', [0, 0.5, 0.01]),
			range('inset', '--sonic-envelope-inset-ratio', [0, 0.3, 0.01]),
			range('handle', '--sonic-envelope-handle-ratio', [0.05, 0.4, 0.005]),
			range('handle ring', '--sonic-envelope-handle-stroke-ratio', [0.005, 0.1, 0.005]),
			range('line', '--sonic-envelope-line-ratio', [0.005, 0.1, 0.005]),
			range('dot', '--sonic-envelope-dot-ratio', [0.03, 0.3, 0.005]),
		],
	},
	{
		from: '.sonic-number',
		name: 'Number',
		tokens: [
			range('size', '--sonic-number-size', [1, 4, 0.125, 'rem']),
			range('aspect', '--sonic-number-aspect-ratio', [1, 5, 0.1]),
			range('corner', '--sonic-number-radius-ratio', [0, 0.5, 0.01]),
			range('inset', '--sonic-number-inset-ratio', [0, 0.5, 0.01]),
			range('text', '--sonic-number-text-ratio', [0.2, 0.8, 0.01]),
			range('travel', '--sonic-number-travel', [40, 400, 10, 'px']),
		],
	},
	{
		from: '.sonic-meter',
		name: 'Meter',
		tokens: [
			range('size', '--sonic-meter-size', [0.25, 1.5, 0.0625, 'rem']),
			range('length', '--sonic-meter-length', [3, 20, 0.5, 'rem']),
			{
				...range('pitch', '--sonic-meter-segment-pitch', [2, 12, 0.5, 'px']),
				resolved: '--_sonic-meter-pitch',
			},
			range('gap', '--sonic-meter-gap-ratio', [0, 0.6, 0.01]),
			range('light corner', '--sonic-meter-segment-radius-ratio', [0, 0.5, 0.01]),
			range('hot from', '--sonic-meter-hot-from', [-60, 0, 1]),
			range('clip from', '--sonic-meter-clip-from', [-60, 0, 1]),
			range('corner', '--sonic-meter-radius-ratio', [0, 0.5, 0.01]),
		],
	},
	{
		from: '.sonic-screen',
		name: 'Screen',
		tokens: [
			range('size', '--sonic-screen-size', [1.5, 6, 0.25, 'rem']),
			range('aspect', '--sonic-screen-aspect-ratio', [1, 6, 0.25]),
			range('corner', '--sonic-screen-radius-ratio', [0, 0.5, 0.01]),
			range('inset', '--sonic-screen-inset-ratio', [0, 0.3, 0.01]),
		],
	},
	{
		from: '.sonic-plate',
		name: 'Plate',
		tokens: [
			range('depth', '--sonic-plate-depth', [-0.25, 0.25, 0.0125, 'rem']),
			range('corner', '--sonic-plate-radius', [0, 2, 0.0625, 'rem']),
		],
	},
];
