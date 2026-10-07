interface Solo {
	markup: string;
	sheets: Array<string>;
	warns?: string;
}

export const sheetMaterial: Record<string, Array<string>> = {
	button: ['core', 'cap', 'well', 'keycap'],
	dial: ['core', 'cap', 'glass', 'readout', 'value', 'arc', 'scale'],
	envelope: ['core', 'glass', 'readout', 'bracket'],
	led: ['core', 'lens'],
	meter: ['core', 'lens', 'groove'],
	number: ['core', 'cap', 'value'],
	panel: ['core'],
	ring: ['core', 'arc'],
	screen: ['core', 'glass', 'pane', 'well'],
	segmented: ['core', 'cap', 'well', 'keycap'],
	slider: ['core', 'cap', 'glass', 'readout', 'value', 'groove', 'scale'],
	spectrum: ['core'],
	switch: ['core', 'cap'],
	toggle: ['core', 'cap', 'well', 'keycap'],
	waveform: ['core', 'cap', 'glass', 'readout', 'value'],
	wavestrip: ['core', 'cap', 'glass', 'readout', 'value'],
	xy: ['core', 'cap', 'glass', 'readout', 'bracket'],
};

const icon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z" /></svg>';

// `warns` names the sheet a case leaves out, which its markup needs
export const solos: Record<string, Solo> = {
	button: {
		markup: `<sonic-button aria-label="Mute" pressed latching>${icon}</sonic-button>`,
		sheets: ['button'],
	},
	'button-led': {
		markup:
			'<sonic-button aria-label="Power" pressed latching><span class="sonic-led"></span></sonic-button>',
		sheets: ['button', 'led'],
	},
	dial: { markup: '<sonic-dial aria-label="Level" value="50"></sonic-dial>', sheets: ['dial'] },
	envelope: {
		markup: '<sonic-envelope aria-label="Shape"></sonic-envelope>',
		sheets: ['envelope'],
	},
	led: { markup: '<span class="sonic-led" data-sonic-lit></span>', sheets: ['led'] },
	meter: { markup: '<sonic-meter max="0" min="-60"></sonic-meter>', sheets: ['meter'] },
	'no-button': {
		markup: `<span class="sonic-ring"><sonic-button aria-label="Loop" latching>${icon}</sonic-button></span>`,
		sheets: ['ring'],
		warns: 'button.css',
	},
	'no-led': {
		markup:
			'<sonic-button aria-label="Power" latching><span class="sonic-led"></span></sonic-button>',
		sheets: ['button'],
		warns: 'led.css',
	},
	'no-led-slider': {
		markup:
			'<sonic-slider aria-label="Pitch" default="0" max="8" min="-8" origin="0" value="0"><span class="sonic-led"></span></sonic-slider>',
		sheets: ['slider'],
		warns: 'led.css',
	},
	number: {
		markup:
			'<sonic-number aria-label="Tempo" max="300" min="20" step="0.5" value="120"></sonic-number>',
		sheets: ['number'],
	},
	panel: {
		markup:
			'<section aria-label="Panel" class="sonic-panel"><h2 class="sonic-panel-title">Panel</h2></section>',
		sheets: ['panel'],
	},
	ring: {
		markup:
			'<span aria-label="Import" aria-valuenow="40" class="sonic-ring" role="progressbar" style="--sonic-ring-to: 0.4"></span>',
		sheets: ['ring'],
	},
	'ring-button': {
		markup: `<span class="sonic-ring" style="--sonic-ring-to: 0.5"><sonic-button aria-label="Loop" pressed latching>${icon}</sonic-button></span>`,
		sheets: ['button', 'ring'],
	},
	screen: { markup: '<div class="sonic-screen">440 Hz</div>', sheets: ['screen'] },
	segmented: {
		markup:
			'<sonic-segmented aria-label="Mode" value="lp"><span data-sonic-value="lp">LP</span><span data-sonic-value="hp">HP</span></sonic-segmented>',
		sheets: ['segmented'],
	},
	slider: {
		markup: '<sonic-slider aria-label="Send" step="5" value="35"></sonic-slider>',
		sheets: ['slider'],
	},
	switch: {
		markup:
			'<sonic-switch aria-label="Talk" value="off"><span data-sonic-value="off">Off</span><span data-sonic-value="on">On</span></sonic-switch>',
		sheets: ['switch'],
	},
	toggle: {
		markup:
			'<sonic-toggle aria-label="Route" value="a"><span data-sonic-value="a">A</span><span data-sonic-value="b">B</span></sonic-toggle>',
		sheets: ['toggle'],
	},
	waveform: {
		markup: '<sonic-waveform aria-label="Detail" max="300" value="150"></sonic-waveform>',
		sheets: ['waveform'],
	},
	wavestrip: {
		markup: '<sonic-wavestrip aria-label="Position" max="300" value="150"></sonic-wavestrip>',
		sheets: ['wavestrip'],
	},
	xy: { markup: '<sonic-xy aria-label="Pad" x="30" y="70"></sonic-xy>', sheets: ['xy'] },
};
