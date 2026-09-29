import type { UserConfig } from 'tsdown';

import { defineConfig } from 'tsdown';

const shared = {
	// Clean runs once for both trees, and clears a flat `dist` from before the split
	clean: ['dist'],
	entry: ['src/index.ts', 'src/define.ts', 'src/define/*.ts'],
	format: 'esm',
	minify: false,
	platform: 'browser',
	unbundle: true,
} satisfies UserConfig;

export default defineConfig([
	{
		...shared,
		define: { __DEV__: 'true' },
		dts: true,
		outDir: 'dist/dev',
		sourcemap: true,
	},
	{
		...shared,
		copy: [
			{ from: 'src/styles/*.css', to: 'dist/styles' },
			{ from: 'src/skins/*.css', to: 'dist/skins' },
		],
		define: { __DEV__: 'false' },
		dts: false,
		outDir: 'dist/default',
		publint: true,
	},
]);
