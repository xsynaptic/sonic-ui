import {
	getAstroConfig,
	getBrowserConfig,
	getConfig,
	getWebComponentConfig,
} from '@xsynaptic/eslint-config';
import globals from 'globals';

export default getConfig([
	{
		ignores: [
			'**/dist/**',
			'**/.astro/**',
			'**/.cache/**',
			'**/temp/**',
			'.claude/**',
			'**/blob-report/**',
			'**/playwright-report/**',
			'**/test-results/**',
		],
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
			// The shared default of 5 makes room for schema chains, which this repo has none of
			'unicorn/max-nested-calls': ['error', { max: 4 }],
		},
	},
	{
		rules: {
			'@typescript-eslint/no-non-null-assertion': 'error',
			'@typescript-eslint/prefer-nullish-coalescing': 'error',
			'unicorn/consistent-compound-words': 'error',
			'unicorn/no-array-sort': 'error',
			'unicorn/no-invalid-argument-count': 'error',
			'unicorn/no-top-level-assignment-in-function': 'error',
		},
	},
	{
		files: ['**/*.test.ts'],
		rules: {
			'unicorn/no-top-level-assignment-in-function': 'off',
		},
	},
	{
		files: ['packages/sonic-ui/src/define.ts'],
		rules: {
			'perfectionist/sort-imports': ['error', { sortSideEffects: true, type: 'natural' }],
		},
	},
	// Everything shipped and everything the playground runs is browser code; only config files see Node
	getBrowserConfig(['packages/sonic-ui/src/**/*', 'playground/src/**/*']),
	{
		// Specs run in Node and hand functions to `page.evaluate`, which run in the page
		files: ['playground/e2e/**/*', 'playground/scripts/**/*', 'playground/playwright.config.ts'],
		languageOptions: {
			globals: { ...globals.node, ...globals.browser },
		},
		rules: {
			'unicorn/prefer-global-this': 'off',
		},
	},
	{
		// Prettier formats the `/* HTML */` literals these elements render
		files: ['packages/sonic-ui/src/elements/**/*.ts'],
		rules: {
			'unicorn/template-indent': 'off',
		},
	},
	getWebComponentConfig(['packages/sonic-ui/src/**/*.ts', 'playground/src/**/*.ts']),
	...getAstroConfig({ a11y: 'strict' }),
	{
		// Form-associated, so a wrapping `<label>` names them
		files: ['playground/src/**/*.astro'],
		rules: {
			'astro/jsx-a11y/label-has-associated-control': [
				'error',
				{ controlComponents: ['sonic-dial', 'sonic-button', 'sonic-segmented', 'sonic-slider'] },
			],
		},
	},
]);
