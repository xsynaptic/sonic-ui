const copyPrefix = 'sonic-copy-';

const idListAttributes = new Set(['aria-describedby', 'aria-labelledby']);

const hrefAttributes = new Set(['href', 'xlink:href']);

const urlReference = /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g;

// A `#name` with a block still to open is a selector; inside a block it is a colour
const idSelector = /#([\w-]+)(?=[^;{}]*\{)/g;

function rewriteUrls(value: string, ids: Set<string>): string {
	return value.replaceAll(urlReference, (reference, quote: string, id: string) =>
		ids.has(id) ? `url(${quote}#${copyPrefix}${id}${quote})` : reference,
	);
}

function rewriteReferences(name: string, value: string, ids: Set<string>): string {
	if (hrefAttributes.has(name)) {
		return value.startsWith('#') && ids.has(value.slice(1))
			? `#${copyPrefix}${value.slice(1)}`
			: value;
	}
	if (idListAttributes.has(name)) {
		return value
			.split(/\s+/)
			.map((id) => (ids.has(id) ? copyPrefix + id : id))
			.join(' ');
	}

	return rewriteUrls(value, ids);
}

function rewriteStyle(text: string, ids: Set<string>): string {
	return rewriteUrls(text, ids).replaceAll(idSelector, (selector, id: string) =>
		ids.has(id) ? `#${copyPrefix}${id}` : selector,
	);
}

function prefixIds(element: Element, ids: Set<string>): void {
	if (element.id !== '') element.id = copyPrefix + element.id;
	if (element.localName === 'style') element.textContent = rewriteStyle(element.textContent, ids);
	for (const attribute of element.attributes) {
		if (attribute.name === 'id') continue;

		const value = rewriteReferences(attribute.name, attribute.value, ids);
		if (value !== attribute.value) attribute.value = value;
	}
}

// The original stays in the document unrendered, and `url(#id)` in a copy would resolve to its `<defs>`
export function copyNode(node: Node): Node {
	const copy = node.cloneNode(true);
	if (!(copy instanceof Element)) return copy;

	const elements = [copy, ...copy.querySelectorAll('*')];
	const ids = new Set(elements.map((element) => element.id).filter((id) => id !== ''));
	if (ids.size === 0) return copy;

	for (const element of elements) prefixIds(element, ids);

	return copy;
}
