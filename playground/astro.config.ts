import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, fontProviders } from 'astro/config';
import { fileURLToPath } from 'node:url';

const library = '@xsynaptic/sonic-ui';
const source = fileURLToPath(new URL('../packages/sonic-ui/src', import.meta.url));

const librarySource = {
	apply: 'serve' as const,
	config: () => ({
		define: { __DEV__: 'true' },
		resolve: {
			alias: [
				{
					find: new RegExp(String.raw`^${library}/skins/(.+\.css)$`),
					replacement: `${source}/skins/$1`,
				},
				{
					find: new RegExp(String.raw`^${library}/(.+\.css)$`),
					replacement: `${source}/styles/$1`,
				},
				{ find: new RegExp(`^${library}/(.+)$`), replacement: `${source}/$1.ts` },
				{ find: new RegExp(`^${library}$`), replacement: `${source}/index.ts` },
			],
		},
	}),
	name: 'library-source',
};

export default defineConfig({
	fonts: [
		{
			cssVariable: '--font-plex-sans',
			name: 'IBM Plex Sans',
			provider: fontProviders.google(),
			styles: ['normal', 'italic'],
			weights: [400, 500, 600, 700],
		},
		{
			cssVariable: '--font-plex-mono',
			fallbacks: ['monospace'],
			name: 'IBM Plex Mono',
			provider: fontProviders.google(),
			styles: ['normal'],
			weights: [400, 700],
		},
	],
	integrations: [react()],
	vite: {
		plugins: [tailwindcss(), librarySource],
	},
});
