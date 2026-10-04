import tailwindcss from '@tailwindcss/vite';
import { defineConfig, fontProviders } from 'astro/config';

export default defineConfig({
	fonts: [
		{
			cssVariable: '--font-plex-sans',
			name: 'IBM Plex Sans',
			provider: fontProviders.google(),
			styles: ['normal'],
			weights: [400, 500, 600],
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
	vite: {
		plugins: [tailwindcss()],
	},
});
