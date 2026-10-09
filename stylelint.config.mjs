const anyValue = ['/^.+$/'];

// Supported at the floor (Chrome 111, Safari 16.4, Firefox 128) but flagged, since Baseline 2022 sits just under it
const atFloor = {
	ignoreAtRules: ['property', 'container'],
	ignoreFunctions: ['color-mix', 'oklch', 'sin', 'cos', 'tan', 'atan2'],
	ignoreProperties: {
		'container-type': anyValue,
		'forced-color-adjust': anyValue,
		outline: anyValue,
		'user-select': anyValue,
	},
	ignoreSelectors: ['has', 'selection'],
	ignoreUnits: ['cqi', 'cqb'],
};

// Used on purpose above the floor; each note says what an older browser loses
const aboveFloor = {
	// A readout appears without its fade
	ignoreAtRules: ['starting-style'],
	ignoreFunctions: [
		// Edges and insets are not snapped to the pixel grid, nor a meter's segments to its pitch
		'round',
	],
	ignoreProperties: {
		// Prefixed at build
		'/^mask(-composite|-image|-repeat)?$/': anyValue,
		// A readout stays shut without anchor positioning, and typed entry with it
		'/^position-(area|try-fallbacks)$/': anyValue,
		// Nothing is lost; the number box only undoes the value sheet's guarded `content`
		'field-sizing': ['fixed'],
	},
	ignoreSelectors: [
		// Flattened at build
		'nesting',
		// A readout stays shut
		'popover-open',
		// Looks that follow a custom state: held, dragging, editing, and a meter's ladder
		'state',
	],
};

/** @type {import('stylelint').Config} */
export default {
	extends: ['@xsynaptic/stylelint-config'],
	overrides: [
		{
			files: ['packages/sonic-ui/src/**/*.css'],
			plugins: ['stylelint-plugin-use-baseline'],
			rules: {
				'plugin/use-baseline': [
					true,
					{
						available: 2022,
						ignoreAtRules: [...atFloor.ignoreAtRules, ...aboveFloor.ignoreAtRules],
						ignoreFunctions: [...atFloor.ignoreFunctions, ...aboveFloor.ignoreFunctions],
						ignoreProperties: { ...atFloor.ignoreProperties, ...aboveFloor.ignoreProperties },
						ignoreSelectors: [...atFloor.ignoreSelectors, ...aboveFloor.ignoreSelectors],
						ignoreUnits: atFloor.ignoreUnits,
					},
				],
			},
		},
		{
			// Public tokens stay unset so a consumer can set them at any scope; the controls resolve them into private values
			files: ['packages/sonic-ui/src/styles/**/*.css'],
			rules: {
				'custom-property-pattern': '^_?sonic-[a-z0-9]+(-[a-z0-9]+)*$',
				'property-disallowed-list': ['/^--sonic-/'],
				'selector-disallowed-list': [
					'/:root/',
					// Only the pre-upgrade placeholder may name a tag, so a renamed element keeps every look
					String.raw`/(^|[\s>+~(])sonic-(button|dial|meter|segmented|slider)(?![\w-]|,|[^\s,]*:not\(:defined)/`,
				],
			},
		},
		{
			// A skin sets public tokens and nothing else
			files: ['packages/sonic-ui/src/skins/**/*.css'],
			rules: {
				'custom-property-pattern': '^sonic-[a-z0-9]+(-[a-z0-9]+)*$',
				'property-disallowed-list': ['/^--_/'],
			},
		},
	],
	reportDescriptionlessDisables: true,
	reportInvalidScopeDisables: true,
	reportNeedlessDisables: true,
	reportUnscopedDisables: true,
};
