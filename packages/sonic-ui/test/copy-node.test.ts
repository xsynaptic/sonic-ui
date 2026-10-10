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
	if (!(copy instanceof Element)) throw new TypeError('The copy is not an element');

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
	if (!(copy instanceof Element)) throw new TypeError('The copy is not an element');

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
	if (!(copy instanceof Element)) throw new TypeError('The copy is not an element');

	expect(copy.querySelector('style')?.textContent).toBe(
		'.pb{fill:url(#sonic-copy-gb)}#sonic-copy-gb i,#sonic-copy-fade{color:#fade;stroke:url(#sprite)}',
	);
});

function copyOf(markup: string): Element {
	const copy = copyNode(parse(markup));
	if (!(copy instanceof Element)) throw new TypeError('The copy is not an element');

	return copy;
}

test('url() follows its id in any letter case and through percent-encoding', () => {
	const copy = copyOf(
		'<span><i id="g b"></i><i id="c"></i><b fill="url(#g%20b)" stroke="URL(#c)" mask="url(#100%)"></b></span>',
	);
	const painted = copy.querySelector('b');

	expect(painted?.getAttribute('fill')).toBe('url(#sonic-copy-g%20b)');
	expect(painted?.getAttribute('stroke')).toBe('url(#sonic-copy-c)');
	expect(painted?.getAttribute('mask')).toBe('url(#100%)');
});

test('a SMIL begin and end follow the ids they wait on, and leave clock values alone', () => {
	const copy = copyOf(
		'<span><i id="a1"></i><i id="2"></i><b begin="a1.end" end="2.5s; a1.begin+1s; other.end"></b></span>',
	);
	const animated = copy.querySelector('b');

	expect(animated?.getAttribute('begin')).toBe('sonic-copy-a1.end');
	expect(animated?.getAttribute('end')).toBe('2.5s; sonic-copy-a1.begin+1s; other.end');
});

test('url() inside a text attribute is left alone', () => {
	const copy = copyOf('<span aria-label="see url(#x)" title="url(#x)"><i id="x"></i></span>');

	expect(copy.getAttribute('aria-label')).toBe('see url(#x)');
	expect(copy.getAttribute('title')).toBe('url(#x)');
});

test('an id list keeps the ids from outside the copy and follows the ones inside', () => {
	const copy = copyOf('<span aria-labelledby="outside  inside other"><i id="inside"></i></span>');

	expect(copy.getAttribute('aria-labelledby')).toBe('outside sonic-copy-inside other');
});

test('an href to another document is left alone, even when its fragment names an id in the copy', () => {
	const copy = copyOf(
		'<span><i id="x"></i><a href="https://example.com/#x"></a><a href="page.html#x"></a></span>',
	);

	expect([...copy.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual([
		'https://example.com/#x',
		'page.html#x',
	]);
});
