import { configDefaults, defineConfig } from 'vitest/config';

// Playwright owns the `*.spec.ts` files in `playground/e2e`
export default defineConfig({
	define: { __DEV__: 'true' },
	test: {
		environment: 'happy-dom',
		// Stryker's sandboxes and agent worktrees hold copies of the suite
		exclude: [...configDefaults.exclude, '.cache/**', '.claude/worktrees/**'],
		include: ['**/*.test.ts'],
		restoreMocks: true,
		setupFiles: [
			'packages/sonic-ui/test/setup.ts',
			...(process.env.STRYKER_MUTATOR_WORKER === undefined
				? []
				: ['packages/sonic-ui/test/stryker-seed.ts']),
		],
		silent: 'passed-only',
		testTimeout: 15_000,
		unstubGlobals: true,
	},
});
