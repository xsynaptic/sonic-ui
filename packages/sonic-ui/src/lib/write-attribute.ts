export function writeAttribute(element: Element, name: string, value: string | undefined): void {
	if (value === undefined) {
		element.removeAttribute(name);
		return;
	}

	element.setAttribute(name, value);
}
