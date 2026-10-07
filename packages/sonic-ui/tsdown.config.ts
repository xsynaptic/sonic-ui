import type { UserConfig } from 'tsdown';

import { defineConfig } from 'tsdown';

const shared = {
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
			{ from: 'src/styles/material/*.css', to: 'dist/styles/material' },
			{ from: 'src/skins/*.css', to: 'dist/skins' },
		],
		define: { __DEV__: 'false' },
		dts: false,
		outDir: 'dist/default',
		publint: true,
	},
]);
