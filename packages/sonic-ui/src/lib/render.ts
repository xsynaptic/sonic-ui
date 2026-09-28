export function requireChild<Child extends Element>(
	root: Element,
	selector: string,
	child: new () => Child,
): Child {
	const found = root.querySelector(selector);
	if (!(found instanceof child)) throw new Error(`A template is missing its ${selector}`);

	return found;
}

export function template<Root extends Element>(html: string, root: new () => Root): () => Root {
	const parsed = document.createElement('template');

	parsed.innerHTML = html;

	return () => {
		const clone = document.importNode(parsed.content, true).firstElementChild;
		if (!(clone instanceof root)) throw new Error(`A template's root is not a ${root.name}`);

		return clone;
	};
}
