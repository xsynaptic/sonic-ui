import { expect, test } from 'vitest';

import { copyNode } from '#lib/copy-node.ts';

function parse(markup: string): Element {
	const host = document.createElement('div');

	host.innerHTML = markup;

	const parsed = host.firstElementChild;
	if (!parsed) throw new Error('Nothing parsed');

	return parsed;
}

function referencedId(root: Element, selector: string, attribute: string): string | undefined {
	return /#([\w-]+)/.exec(root.querySelector(selector)?.getAttribute(attribute) ?? '')?.[1];
}

const icon = /* HTML */ `
	<svg viewBox="0 0 10 10" aria-labelledby="icon-title">
		<title id="icon-title">Play</title>
		<defs>
			<linearGradient id="fill"><stop offset="0" stop-color="red" /></linearGradient>
			<clipPath id="clip"><circle cx="5" cy="5" r="2" /></clipPath>
		</defs>
		<rect
			width="10"
			height="10"
			fill="url(#fill)"
			clip-path="url('#clip')"
			style="stroke: url(#sprite)"
		/>
		<use href="#clip" />
		<use href="#sprite" />
	</svg>
`;

test('every reference inside a copy resolves inside that copy', () => {
	const copy = copyNode(parse(icon));
	if (!(copy instanceof Element)) throw new Error('The copy is not an element');

	const references = [
		copy.getAttribute('aria-labelledby'),
		referencedId(copy, 'rect', 'fill'),
		referencedId(copy, 'rect', 'clip-path'),
		referencedId(copy, 'use', 'href'),
	];

	expect(references).toEqual([
		'sonic-copy-icon-title',
		'sonic-copy-fill',
		'sonic-copy-clip',
		'sonic-copy-clip',
	]);
	for (const id of references)
		expect(copy.querySelector(`[id="${CSS.escape(String(id))}"]`)).not.toBeNull();
});

test('a reference to something outside the copy is left alone', () => {
	const copy = copyNode(parse(icon));
	if (!(copy instanceof Element)) throw new Error('The copy is not an element');

	expect(copy.querySelector('rect')?.getAttribute('style')).toBe('stroke: url(#sprite)');
	expect(copy.querySelectorAll('use')[1]?.getAttribute('href')).toBe('#sprite');
});

test('the original keeps its ids', () => {
	const original = parse(icon);

	copyNode(original);

	expect([...original.querySelectorAll('[id]')].map((element) => element.id)).toEqual([
		'icon-title',
		'fill',
		'clip',
	]);
});

// happy-dom drops the text of a `<style>` inside an `<svg>`
test('a style block inside a copy follows the prefixed ids, in url() and in selectors', () => {
	const copy = copyNode(
		parse(
			'<span><style>.pb{fill:url(#gb)}#gb i,#fade{color:#fade;stroke:url(#sprite)}</style><b id="gb"><i></i></b><b id="fade" class="pb"></b></span>',
		),
	);
	if (!(copy instanceof Element)) throw new Error('The copy is not an element');

	expect(copy.querySelector('style')?.textContent).toBe(
		'.pb{fill:url(#sonic-copy-gb)}#sonic-copy-gb i,#sonic-copy-fade{color:#fade;stroke:url(#sprite)}',
	);
});
