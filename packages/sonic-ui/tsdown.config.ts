import { defineConfig } from 'tsdown';

export default defineConfig({
	copy: [
		{ from: 'src/styles/*.css', to: 'dist/styles' },
		{ from: 'src/skins/*.css', to: 'dist/skins' },
	],
	dts: true,
	entry: ['src/index.ts', 'src/define.ts', 'src/define/*.ts'],
	format: 'esm',
	minify: false,
	platform: 'browser',
	publint: true,
	sourcemap: true,
	unbundle: true,
});
