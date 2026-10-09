import autoprefixer from 'autoprefixer';
import { glob, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import postcssNesting from 'postcss-nesting';

const floor = ['chrome 111', 'safari 16.4', 'ios_saf 16.4', 'firefox 128'];

// Native nesting needs Chrome 112 and Safari 16.5; unprefixed masks need Chrome 120, and `user-select` a prefix in Safari
const dist = fileURLToPath(new URL('../packages/sonic-ui/dist', import.meta.url));
const processor = postcss([postcssNesting(), autoprefixer({ overrideBrowserslist: floor })]);
const sheets = glob(['styles/**/*.css', 'skins/*.css'], { cwd: dist });

for await (const sheet of sheets) {
	const path = `${dist}/${sheet}`;
	const compiled = await processor.process(await readFile(path, 'utf8'), { from: path });

	await writeFile(path, compiled.css);
}
