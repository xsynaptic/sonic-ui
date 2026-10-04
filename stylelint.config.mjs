/** @type {import('stylelint').Config} */
export default {
	extends: ['@xsynaptic/stylelint-config'],
	overrides: [
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
