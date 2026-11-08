import { configDefaults, defineConfig } from 'vitest/config';

const STRYKER_MUTATOR_WORKER = process.env.STRYKER_MUTATOR_WORKER;

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
			...(STRYKER_MUTATOR_WORKER === undefined ? [] : ['packages/sonic-ui/test/stryker-seed.ts']),
		],
		silent: 'passed-only',
		// Under Stryker a failed test counts as a kill, so a slow mutant is left to Stryker's own timeout
		testTimeout: STRYKER_MUTATOR_WORKER === undefined ? 15_000 : 0,
		unstubGlobals: true,
	},
});
