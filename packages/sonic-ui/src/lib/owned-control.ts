// eslint-disable-next-line unicorn/consistent-boolean-name -- the name bundlers and other kits use
declare const __DEV__: boolean;

const checkedChildren = new WeakSet<object>();

function isContent(child: Node): boolean {
	if (child instanceof Element) return true;

	return child instanceof Text && child.data.trim() !== '';
}

export function appendOnce(host: HTMLElement, control: Element): void {
	const [hook] = control.classList;
	const stale = [...host.children].filter(
		(child) => child !== control && hook !== undefined && child.classList.contains(hook),
	);

	for (const child of stale) child.remove();
	if (control.parentNode !== host) host.append(control);
}

export function checkChildren(host: HTMLElement, undocumented: Array<Node>): void {
	if (!__DEV__ || checkedChildren.has(host.constructor)) return;

	const found = undocumented.find((child) => isContent(child));
	if (!found) return;

	checkedChildren.add(host.constructor);
	console.warn(
		`<${host.localName}> uses only the children it documents, so the ${
			found instanceof Element ? `<${found.localName}>` : 'text'
		} inside it is unsupported`,
	);
}
