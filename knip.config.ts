import type { KnipConfig } from 'knip';

export default {
	// A package entry's exports go unchecked by default, so dead public surface accretes unseen
	// A deliberate export takes `/** @public */` at the declaration rather than a widening here
	includeEntryExports: true,
	workspaces: {
		'.': {
			ignoreDependencies: [
				// Indirect peer of `@xsynaptic/eslint-config`'s getAstroConfig({ a11y: 'strict' })
				'eslint-plugin-jsx-a11y',
			],
		},
	},
} satisfies KnipConfig;
