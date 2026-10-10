declare const __DEV__: boolean;

const checkedSheets = new WeakMap<object, Set<string>>();

interface StyleProbe {
	selector?: string;
	sheet: string;
	token: string;
}

// A padding or margin the sheets leave at zero only where `ratio` is zero
export interface BoxProbe {
	property: string;
	ratio?: `--_sonic-${string}`;
	selector?: string;
}

function isLost(drawn: Element, { token }: StyleProbe): boolean {
	return getComputedStyle(drawn).getPropertyValue(token) === '';
}

const hostBoxProperties = [
	'margin-top',
	'margin-right',
	'margin-bottom',
	'margin-left',
	'padding-top',
	'padding-right',
	'padding-bottom',
	'padding-left',
	'width',
	'height',
];

// An environment with no computed styles answers '', which is no box property
function readHostBox(host: Element): string | undefined {
	const style = getComputedStyle(host);
	if (style.display === 'none') return undefined;
	if (style.display !== 'contents') return 'display';

	return hostBoxProperties.find(
		(property) => !['', '0px', 'auto'].includes(style.getPropertyValue(property)),
	);
}

function isZeroed(control: Element, { property, ratio, selector }: BoxProbe): boolean {
	const part = selector === undefined ? control : control.querySelector(selector);
	if (!part || getComputedStyle(part).getPropertyValue(property) !== '0px') return false;

	return ratio === undefined || Number(getComputedStyle(control).getPropertyValue(ratio)) !== 0;
}

function checkHost(host: Element, checked: Set<string>): void {
	const hostBox = readHostBox(host);
	if (hostBox === undefined) return;

	checked.add('host');
	console.warn(
		hostBox === 'display'
			? `<${host.localName}> is given a display, but it has to stay display: contents; lay it out through a parent or a wrapper`
			: `<${host.localName}> is display: contents and has no box, so its ${hostBox} does nothing; set it on a parent or a wrapper`,
	);
}

export interface StyleCheck {
	box?: BoxProbe | undefined;
	control: HTMLElement;
	sheet: string;
}

// Once a class; a sheet that is missing has already said why the control looks wrong
function checkReset(host: Element, { box, control }: StyleCheck, checked: Set<string>): void {
	if (!control.isConnected) return;

	if (!checked.has('host')) checkHost(host, checked);
	if (!box || checked.has('reset') || !isZeroed(control, box)) return;

	checked.add('reset');
	console.warn(
		`<${host.localName}> has lost its ${box.property} to a rule outside a layer, which beats every sonic rule; import that stylesheet into a layer declared before sonic`,
	);
}

export function checkStyles(host: Element, check: StyleCheck): void {
	if (!__DEV__) return;

	const { box, control, sheet } = check;
	const elementClass = host.constructor;
	const checked = checkedSheets.get(elementClass) ?? new Set<string>();
	const part = ({ selector }: StyleProbe): Element | undefined =>
		selector === undefined ? control : (host.querySelector(selector) ?? undefined);
	// An LED inherits `--_sonic-unit` from its control, so a token of its own probes it
	const probes: Array<StyleProbe> = [
		{ sheet: 'material/core.css', token: '--_sonic-unlit' },
		{ sheet, token: '--_sonic-unit' },
		{ selector: '.sonic-led', sheet: 'led.css', token: '--_sonic-led-lens-ratio' },
	].filter((probe) => !checked.has(probe.sheet) && part(probe) !== undefined);
	const isResetChecked = !box || checked.has('reset');
	const isBoxChecked = isResetChecked && checked.has('host');
	if (isBoxChecked && probes.length === 0) return;

	checkedSheets.set(elementClass, checked);
	for (const probe of probes) checked.add(probe.sheet);
	requestAnimationFrame(() => {
		const missing: Array<string> = [];

		for (const probe of probes) {
			const drawn = control.isConnected ? part(probe) : undefined;

			if (!drawn) checked.delete(probe.sheet);
			else if (isLost(drawn, probe)) missing.push(`@xsynaptic/sonic-ui/${probe.sheet}`);
		}
		if (missing.length === 0) {
			checkReset(host, check, checked);
			return;
		}

		checked.add('host').add('reset');
		console.warn(
			`<${host.localName}> draws blank without ${missing.join(' and ')} (or controls.css)`,
		);
	});
}
