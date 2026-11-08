import type { KnipConfig } from 'knip';

export default {
	workspaces: {
		'.': {
			ignoreDependencies: [
				// Indirect peer of `@xsynaptic/eslint-config`'s getAstroConfig({ a11y: 'strict' })
				'eslint-plugin-jsx-a11y',
			],
		},
		'packages/sonic-ui': {
			entry: ['test/stryker-seed.ts'],
		},
	},
} satisfies KnipConfig;
