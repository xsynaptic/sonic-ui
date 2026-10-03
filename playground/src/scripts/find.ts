type ElementType = abstract new () => Element;

export type ControlsOf<Spec extends Record<string, ElementType>> = {
	[Name in keyof Spec]: InstanceType<Spec[Name]>;
};

export function find<T extends Element>(
	root: ParentNode,
	selector: string,
	type: abstract new () => T,
): T {
	const found = root.querySelector(selector);
	if (!found) throw new Error(`The page has no ${selector}`);
	if (!(found instanceof type)) {
		throw new TypeError(`${selector} is a <${found.localName}>, not a ${type.name}`);
	}

	return found;
}

export function dataHook(name: string): string {
	return `:scope [data-${name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`;
}

export function readControls<Spec extends Record<string, ElementType>>(
	root: ParentNode,
	spec: Spec,
	selectorFor: (name: string) => string,
): ControlsOf<Spec> {
	const entries = Object.entries(spec).map(([name, type]) => [
		name,
		find(root, selectorFor(name), type),
	]);

	// `Object.fromEntries` widens the keys to `string`
	return Object.fromEntries(entries) as ControlsOf<Spec>;
}
