/** @type {import('prettier').Config} */
export default {
	plugins: ['prettier-plugin-astro', 'prettier-plugin-tailwindcss'],
	printWidth: 100,
	// Editing a sentence never re-wraps its neighbours
	proseWrap: 'never',
	singleQuote: true,
	tailwindStylesheet: './playground/src/styles/playground.css',
	useTabs: true,
};
