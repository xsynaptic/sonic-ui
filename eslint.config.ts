import {
	getAstroConfig,
	getBrowserConfig,
	getConfig,
	getWebComponentConfig,
} from '@xsynaptic/eslint-config';

export default getConfig([
	{
		ignores: ['**/dist/**', '**/.astro/**', '**/.cache/**', '**/temp/**', '.claude/**'],
	},
	{
		rules: {
			complexity: ['warn', { max: 8, variant: 'modified' }],
			'logical-assignment-operators': ['error', 'never'],
			'max-depth': ['warn', 3],
			'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
			'max-params': ['warn', 3],
			'max-statements': ['warn', 25],
			'unicorn/logical-assignment-operators': 'off',
		},
	},
	// Everything shipped and everything the playground runs is browser code; only config files see Node
	getBrowserConfig(['packages/sonic-ui/src/**/*', 'playground/src/**/*']),
	{
		// Prettier formats the `/* HTML */` literals these elements render
		files: ['packages/sonic-ui/src/elements/**/*.ts'],
		rules: {
			'unicorn/template-indent': 'off',
		},
	},
	getWebComponentConfig(['packages/sonic-ui/src/**/*.ts', 'playground/src/**/*.ts']),
	...getAstroConfig({ a11y: 'strict' }),
]);
