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
			colour('ink', '--sonic-ink', { resolved: '--_sonic-ink' }),
			colour('ink disabled', '--sonic-ink-disabled', { resolved: '--_sonic-ink-disabled' }),
			colour('focus', '--sonic-focus'),
			{
				...range('focus glow', '--sonic-focus-glow', [0, 1, 0.05]),
				resolved: '--_sonic-focus-strength',
			},
			range('disabled opacity', '--sonic-disabled-opacity', [0.2, 1, 0.05]),
			colour('dimmed', '--sonic-dimmed', { resolved: '--_sonic-lit-off' }),
			colour('modulation', '--sonic-modulation', {
				from: '.sonic-dial-modulation',
				resolved: '--_sonic-dial-modulation',
			}),
			colour('glass', '--sonic-glass', { from: '.sonic-screen' }),
			colour('glass text', '--sonic-glass-text', { from: '.sonic-screen' }),
			colour('readout glass', '--sonic-readout-glass', {
				from: '.sonic-dial-readout',
				resolved: '--_sonic-glass',
			}),
			{
				...range('readout depth', '--sonic-readout-depth', [0, 1, 0.05]),
				from: '.sonic-dial-readout',
			},
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
			colour('lit ok', '--sonic-lit-ok', { from: '.sonic-button-cap > .sonic-led' }),
			colour('buffered', '--sonic-buffered', {
				from: '.sonic-slider',
				resolved: '--_sonic-slider-buffered',
			}),
			colour('marker', '--sonic-marker', {
				from: '.sonic-wavestrip',
				resolved: '--_sonic-marker-default',
			}),
			colour('lit warning', '--sonic-lit-warning', { from: '.sonic-meter' }),
			colour('lit danger', '--sonic-lit-danger', { from: '.sonic-meter' }),
			range('light tilt', '--sonic-light-tilt', [-60, 60, 1, 'deg']),
			range('relief', '--sonic-relief', [0, 1, 0.05]),
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
			range('indicator', '--sonic-dial-indicator-ratio', [0.01, 0.15, 0.005]),
			range('indicator taper', '--sonic-dial-indicator-taper', [0, 1, 0.05]),
			range('face drift', '--sonic-dial-face-drift', [0, 0.5, 0.01]),
			range('sweep', '--sonic-dial-sweep', [180, 360, 5, 'deg']),
			range('dot', '--sonic-dial-dot', [5, 90, 1, 'deg']),
			range('notch', '--sonic-dial-notch-ratio', [0, 0.2, 0.005]),
			range('scale', '--sonic-dial-scale-ratio', [0, 0.4, 0.005]),
			range('scale font', '--sonic-dial-scale-font-ratio', [0.05, 0.4, 0.005]),
			range('ridge pitch', '--sonic-dial-ridge-pitch', [2, 12, 0.5, 'px']),
			range('travel', '--sonic-dial-travel', [40, 400, 10, 'px']),
		],
	},
	{
		from: '.sonic-button',
		name: 'Button',
		tokens: [
			range('size', '--sonic-button-size', [1.25, 6, 0.25, 'rem']),
			range('aspect', '--sonic-button-aspect-ratio', [1, 5, 0.1]),
			range('gap', '--sonic-button-gap-ratio', [0, 0.15, 0.005]),
			range('corner', '--sonic-button-radius-ratio', [0, 0.5, 0.01]),
			range('bevel', '--sonic-button-bevel-ratio', [0, 0.25, 0.005]),
			range('face corner', '--sonic-button-face-radius-ratio', [0, 0.5, 0.01]),
			range('icon', '--sonic-button-icon-ratio', [0.2, 0.8, 0.01]),
			range('led', '--sonic-button-led-ratio', [0.1, 0.4, 0.01]),
			range('icon with led', '--sonic-button-led-icon-ratio', [0.15, 0.6, 0.01]),
			range('font', '--sonic-button-font-ratio', [0.15, 0.6, 0.01]),
			range('padding', '--sonic-button-padding-ratio', [0, 0.6, 0.01]),
			range('depth', '--sonic-button-depth-ratio', [0, 0.1, 0.005]),
			range('press scale', '--sonic-button-press-scale', [0.85, 1, 0.005]),
			range('latched scale', '--sonic-button-latched-scale', [0.85, 1, 0.005]),
		],
	},
	{
		from: '.sonic-slider',
		name: 'Slider',
		tokens: [
			range('size', '--sonic-slider-size', [1.25, 4, 0.25, 'rem']),
			range('length', '--sonic-slider-length', [4, 20, 0.5, 'rem']),
			range('groove', '--sonic-slider-groove-ratio', [0, 0.4, 0.005]),
			range('groove ends', '--sonic-slider-groove-radius-ratio', [0, 0.5, 0.01]),
			range('groove anchor', '--sonic-slider-groove-anchor', [0, 1, 0.05]),
			range('cap', '--sonic-slider-cap-ratio', [0.2, 1.5, 0.01]),
			range('corner', '--sonic-slider-radius-ratio', [0, 0.5, 0.01]),
			range('bevel', '--sonic-slider-bevel-ratio', [0, 0.25, 0.005]),
			range('indicator', '--sonic-slider-indicator-ratio', [0.01, 0.15, 0.005]),
			colour('indicator colour', '--sonic-slider-indicator'),
			range('scale', '--sonic-slider-scale-ratio', [0, 1, 0.01]),
			range('scale font', '--sonic-slider-scale-font-ratio', [0.1, 0.6, 0.01]),
		],
	},
	{
		from: '.sonic-wavestrip',
		name: 'Wavestrip',
		tokens: [
			range('size', '--sonic-wavestrip-size', [2, 6, 0.25, 'rem']),
			range('bar pitch', '--sonic-wavestrip-bar-pitch', [1, 8, 0.5, 'px']),
			range('gap', '--sonic-wavestrip-bar-gap-ratio', [0, 0.8, 0.01]),
			range('bar corner', '--sonic-wavestrip-bar-radius-ratio', [0, 0.5, 0.01]),
			range('marker', '--sonic-wavestrip-marker-ratio', [0.04, 0.3, 0.005]),
			colour('wave', '--sonic-wave', { resolved: '--_sonic-wavestrip-wave' }),
			colour('scrub', '--sonic-scrub', { resolved: '--_sonic-wavestrip-scrub' }),
			range('cancel zone', '--sonic-cancel-zone', [0, 120, 4, 'px']),
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
		name: 'Segmented',
		tokens: [
			range('size', '--sonic-segmented-size', [1.25, 4, 0.25, 'rem']),
			range('gap', '--sonic-segmented-gap-ratio', [0, 0.2, 0.005]),
			range('corner', '--sonic-segmented-radius-ratio', [0, 0.5, 0.01]),
			range('bevel', '--sonic-segmented-bevel-ratio', [0, 0.25, 0.005]),
			range('depth', '--sonic-segmented-depth-ratio', [0, 0.1, 0.005]),
			range('press scale', '--sonic-segmented-press-scale', [0.85, 1, 0.005]),
			range('latched scale', '--sonic-segmented-latched-scale', [0.85, 1, 0.005]),
			range('font', '--sonic-segmented-font-ratio', [0.15, 0.6, 0.01]),
			range('padding', '--sonic-segmented-padding-ratio', [0, 0.6, 0.01]),
			range('icon', '--sonic-segmented-icon-ratio', [0.2, 0.8, 0.01]),
		],
	},
	{
		from: '.sonic-switch',
		name: 'Switch',
		tokens: [
			range('size', '--sonic-switch-size', [1, 6, 0.25, 'rem']),
			range('reach', '--sonic-switch-reach-ratio', [0, 0.5, 0.01]),
			range('bat', '--sonic-switch-bat-ratio', [0.1, 0.6, 0.01]),
			range('bushing', '--sonic-switch-bushing-ratio', [0.2, 1, 0.01]),
			range('font', '--sonic-switch-font-ratio', [0.15, 0.8, 0.01]),
		],
	},
	{
		from: '.sonic-toggle',
		name: 'Toggle',
		tokens: [
			range('size', '--sonic-toggle-size', [1, 6, 0.25, 'rem']),
			range('travel', '--sonic-toggle-travel-ratio', [0.3, 1.5, 0.01]),
			range('gap', '--sonic-toggle-gap-ratio', [0, 0.2, 0.005]),
			range('corner', '--sonic-toggle-radius-ratio', [0, 0.5, 0.01]),
			range('bevel', '--sonic-toggle-bevel-ratio', [0, 0.25, 0.005]),
			range('depth', '--sonic-toggle-depth-ratio', [0, 0.1, 0.005]),
			range('press scale', '--sonic-toggle-press-scale', [0.85, 1, 0.005]),
			range('font', '--sonic-toggle-font-ratio', [0.15, 0.6, 0.01]),
			range('icon', '--sonic-toggle-icon-ratio', [0.2, 0.8, 0.01]),
			range('led', '--sonic-toggle-led-ratio', [0.1, 0.5, 0.01]),
		],
	},
	{
		from: '.sonic-button-cap > .sonic-led',
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
		],
	},
	{
		from: '.sonic-envelope',
		name: 'Envelope',
		tokens: [
			range('size', '--sonic-envelope-size', [3, 10, 0.25, 'rem']),
			range('aspect', '--sonic-envelope-aspect-ratio', [1, 6, 0.1]),
			range('inset', '--sonic-envelope-inset-ratio', [0, 0.3, 0.01]),
			range('handle', '--sonic-envelope-handle-ratio', [0.05, 0.4, 0.005]),
			range('handle ring', '--sonic-envelope-handle-stroke-ratio', [0.005, 0.1, 0.005]),
			range('line', '--sonic-envelope-line-ratio', [0.005, 0.1, 0.005]),
			range('curve handle', '--sonic-envelope-curve-ratio', [0.03, 0.3, 0.005]),
		],
	},
	{
		from: '.sonic-number',
		name: 'Number box',
		tokens: [
			range('size', '--sonic-number-size', [1, 4, 0.125, 'rem']),
			range('aspect', '--sonic-number-aspect-ratio', [1, 5, 0.1]),
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
			range('segment corner', '--sonic-meter-segment-radius-ratio', [0, 0.5, 0.01]),
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
			range('corner', '--sonic-screen-radius-ratio', [0, 0.5, 0.01]),
			range('inset', '--sonic-screen-inset-ratio', [0, 0.3, 0.01]),
			range('glass depth', '--sonic-glass-depth', [0, 1, 0.05]),
			range('glass texture', '--sonic-glass-texture', [0, 1, 0.25]),
		],
	},
	{
		from: '.sonic-panel',
		name: 'Panel',
		tokens: [
			range('depth', '--sonic-panel-depth', [-0.25, 0.25, 0.0125, 'rem']),
			range('corner', '--sonic-panel-radius', [0, 2, 0.0625, 'rem']),
		],
	},
];
