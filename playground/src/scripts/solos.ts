interface Solo {
	markup: string;
	sheets: Array<string>;
	warns?: string;
}

const icon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z" /></svg>';

// `warns` names the sheet a case leaves out, which its markup needs
export const solos: Record<string, Solo> = {
	dial: { markup: '<sonic-dial aria-label="Level" value="50"></sonic-dial>', sheets: ['dial'] },
	envelope: {
		markup: '<sonic-envelope aria-label="Shape"></sonic-envelope>',
		sheets: ['envelope'],
	},
	key: {
		markup: `<sonic-key aria-label="Mute" pressed toggle>${icon}</sonic-key>`,
		sheets: ['key'],
	},
	'key-led': {
		markup:
			'<sonic-key aria-label="Power" pressed toggle><span class="sonic-led"></span></sonic-key>',
		sheets: ['key', 'led'],
	},
	led: { markup: '<span class="sonic-led" data-sonic-lit></span>', sheets: ['led'] },
	lever: {
		markup:
			'<sonic-lever aria-label="Talk" value="off"><span data-sonic-value="off">Off</span><span data-sonic-value="on">On</span></sonic-lever>',
		sheets: ['lever'],
	},
	meter: { markup: '<sonic-meter max="0" min="-60"></sonic-meter>', sheets: ['meter'] },
	'no-key': {
		markup: `<span class="sonic-ring"><sonic-key aria-label="Loop" toggle>${icon}</sonic-key></span>`,
		sheets: ['ring'],
		warns: 'key.css',
	},
	'no-led': {
		markup: '<sonic-key aria-label="Power" toggle><span class="sonic-led"></span></sonic-key>',
		sheets: ['key'],
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
	plate: {
		markup:
			'<section aria-label="Plate" class="sonic-plate"><h2 class="sonic-plate-title">Plate</h2></section>',
		sheets: ['plate'],
	},
	ring: {
		markup:
			'<span aria-label="Import" aria-valuenow="40" class="sonic-ring" role="progressbar" style="--sonic-ring-to: 0.4"></span>',
		sheets: ['ring'],
	},
	'ring-key': {
		markup: `<span class="sonic-ring" style="--sonic-ring-to: 0.5"><sonic-key aria-label="Loop" pressed toggle>${icon}</sonic-key></span>`,
		sheets: ['key', 'ring'],
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
