interface ElementUsage {
	define: string;
	sheet?: string;
	tag: string;
}

interface ClassUsage {
	className: string;
	sheet: string;
}

export type Usage = ClassUsage | ElementUsage;

export const categories = [
	{ id: 'control', label: 'Controls' },
	{ id: 'display', label: 'Displays' },
	{ id: 'part', label: 'Parts' },
] as const;

export interface Control {
	category: (typeof categories)[number]['id'];
	lead: string;
	name: string;
	slug: string;
	usage: ReadonlyArray<Usage>;
}

function element(name: string): ElementUsage {
	return { define: `./define/${name}`, sheet: `${name}.css`, tag: `sonic-${name}` };
}

function sheetClass(name: string): ClassUsage {
	return { className: `sonic-${name}`, sheet: `${name}.css` };
}

export const controls = [
	{
		category: 'control',
		lead: 'Sets one value by turning, the way the controls on a mixer or a synth do.',
		name: 'Dial',
		slug: 'dial',
		usage: [element('dial')],
	},
	{
		category: 'control',
		lead: 'Sets one value by sliding a cap along a groove: a channel fader, a crossfader, a seek bar.',
		name: 'Slider',
		slug: 'slider',
		usage: [element('slider')],
	},
	{
		category: 'control',
		lead: 'A press control that stays down while held, or latches until pressed again.',
		name: 'Button',
		slug: 'button',
		usage: [element('button')],
	},
	{
		category: 'control',
		lead: 'A bat handle that tilts between two or three positions, as on a guitar amp or an old console.',
		name: 'Switch',
		slug: 'switch',
		usage: [element('switch')],
	},
	{
		category: 'control',
		lead: 'A round cap that slides between two or three positions in its well.',
		name: 'Toggle',
		slug: 'toggle',
		usage: [element('toggle')],
	},
	{
		category: 'control',
		lead: 'A row of joined caps for choosing one of a few options, such as a filter type or a sync division.',
		name: 'Segmented',
		slug: 'segmented',
		usage: [element('segmented')],
	},
	{
		category: 'control',
		lead: 'Shows a value as digits that can be dragged, stepped with the keys or typed into.',
		name: 'Number box',
		slug: 'number',
		usage: [element('number')],
	},
	{
		category: 'control',
		lead: 'Sets two values at once with one puck, such as cutoff against resonance.',
		name: 'XY pad',
		slug: 'xy',
		usage: [element('xy')],
	},
	{
		category: 'control',
		lead: 'Draws an envelope’s stages as a graph whose handles turn the dials that hold each stage.',
		name: 'Envelope',
		slug: 'envelope',
		usage: [element('envelope')],
	},
	{
		category: 'control',
		lead: 'Keeps a group of value controls adding up to the same total, so raising one lowers the rest.',
		name: 'Split',
		slug: 'split',
		usage: [{ define: './define/split', tag: 'sonic-split' }],
	},
	{
		category: 'display',
		lead: 'A single lamp that shows a state: lit, idle or unlit.',
		name: 'LED',
		slug: 'led',
		usage: [sheetClass('led')],
	},
	{
		category: 'display',
		lead: 'Shows signal level as a bar or a ladder of segments, with the ballistics of a hardware meter.',
		name: 'Meter',
		slug: 'meter',
		usage: [element('meter')],
	},
	{
		category: 'display',
		lead: 'A box of dark glass that holds text, graphics or a control.',
		name: 'Screen',
		slug: 'screen',
		usage: [sheetClass('screen')],
	},
	{
		category: 'display',
		lead: 'Shows one line of text and scrolls it there and back when it does not fit.',
		name: 'Ticker',
		slug: 'ticker',
		usage: [element('ticker')],
	},
	{
		category: 'display',
		lead: 'The overview of a whole track, drawn as bars and scrubbed to seek, with regions to drag over it.',
		name: 'Wavestrip',
		slug: 'wavestrip',
		usage: [element('wavestrip'), element('region')],
	},
	{
		category: 'display',
		lead: 'The close-up of a wave, scrolling under a fixed playhead.',
		name: 'Waveform',
		slug: 'waveform',
		usage: [element('waveform')],
	},
	{
		category: 'display',
		lead: 'Shows level against frequency, as one filled shape or a bar per band.',
		name: 'Spectrum',
		slug: 'spectrum',
		usage: [element('spectrum')],
	},
	{
		category: 'display',
		lead: 'A titled section that groups related controls and displays.',
		name: 'Panel',
		slug: 'panel',
		usage: [sheetClass('panel')],
	},
	{
		category: 'part',
		lead: 'A lit arc that shows a value around a dial, or progress around a button.',
		name: 'Ring',
		slug: 'ring',
		usage: [sheetClass('ring')],
	},
] as const satisfies ReadonlyArray<Control>;

export type Slug = (typeof controls)[number]['slug'];
