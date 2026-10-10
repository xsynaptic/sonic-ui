export function requireChild<Child extends Element>(
	root: Element,
	selector: string,
	child: new () => Child,
): Child {
	const found = root.querySelector(selector);
	if (!(found instanceof child)) throw new TypeError(`A template is missing its ${selector}`);

	return found;
}

export function template<Root extends Element>(html: string, root: new () => Root): () => Root {
	const parsed = document.createElement('template');

	parsed.innerHTML = html;

	return () => {
		const clone = document.importNode(parsed.content, true).firstElementChild;
		if (!(clone instanceof root)) throw new TypeError(`A template's root is not a ${root.name}`);

		return clone;
	};
}

export function placeChildren(parent: Element, children: Array<Node>): void {
	const dropped = [...parent.childNodes].filter((child) => !children.includes(child));

	for (const child of dropped) child.remove();
	for (const [index, child] of children.entries()) {
		const current = parent.childNodes[index];

		// A node taken out and put back restarts its animations
		if (current === child) continue;

		if (current) current.before(child);
		else parent.append(child);
	}
}

export interface MirrorSlots {
	kept: HTMLSlotElement;
	shown: HTMLSlotElement;
}

// An id resolves to the first element in the tree that carries it, and paints nothing when that one has no box
export function attachSlots(host: HTMLElement): MirrorSlots {
	const shown = document.createElement('slot');
	const kept = document.createElement('slot');

	kept.style.cssText =
		'position: absolute; display: block; inline-size: 0; block-size: 0; overflow: hidden; visibility: hidden';
	host.attachShadow({ mode: 'open', slotAssignment: 'manual' }).append(shown, kept);

	return { kept, shown };
}
