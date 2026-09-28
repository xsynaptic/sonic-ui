// `from` overrides the group's part; `resolved` names the private property when it differs
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

export type TunerToken = ColourToken | RangeToken;

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
			colour('hot', '--sonic-hot', { from: '.sonic-meter' }),
			colour('clip', '--sonic-clip', { from: '.sonic-meter' }),
			range('light tilt', '--sonic-light-tilt', [-60, 60, 1, 'deg']),
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
			range('notch', '--sonic-dial-notch-ratio', [0, 0.2, 0.005]),
			range('ridge pitch', '--sonic-dial-ridge-pitch', [2, 12, 0.5, 'px']),
			range('travel', '--sonic-dial-travel', [40, 400, 10, 'px']),
		],
	},
	{
		from: '.sonic-key',
		name: 'Key',
		tokens: [
			range('size', '--sonic-key-size', [1.25, 6, 0.25, 'rem']),
			range('gap', '--sonic-key-gap-ratio', [0, 0.15, 0.005]),
			range('corner', '--sonic-key-radius-ratio', [0, 0.5, 0.01]),
			range('bevel', '--sonic-key-bevel-ratio', [0, 0.25, 0.005]),
			range('face corner', '--sonic-key-face-radius-ratio', [0, 0.5, 0.01]),
			range('icon', '--sonic-key-icon-ratio', [0.2, 0.8, 0.01]),
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
];
