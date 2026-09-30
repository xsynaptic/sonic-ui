// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- mirrors `querySelector<T>`, whose selector cannot carry the type
export function find<T extends Element>(root: ParentNode, selector: string): T {
	const found = root.querySelector<T>(selector);
	if (!found) throw new Error(`The page has no ${selector}`);

	return found;
}
