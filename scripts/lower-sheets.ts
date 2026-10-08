import { glob, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import postcssNesting from 'postcss-nesting';

// Native nesting needs Chrome 112 and Safari 16.5; nothing else in a built sheet is rewritten
const dist = fileURLToPath(new URL('../packages/sonic-ui/dist', import.meta.url));
const processor = postcss([postcssNesting()]);
const sheets = glob(['styles/**/*.css', 'skins/*.css'], { cwd: dist });

for await (const sheet of sheets) {
	const path = `${dist}/${sheet}`;
	const lowered = await processor.process(await readFile(path, 'utf8'), { from: path });

	await writeFile(path, lowered.css);
}
