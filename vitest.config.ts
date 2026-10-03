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
		silent: 'passed-only',
		unstubGlobals: true,
	},
});
