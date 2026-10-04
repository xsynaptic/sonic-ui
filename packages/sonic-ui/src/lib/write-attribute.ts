export function writeAttribute(element: Element, name: string, value: string | undefined): void {
	if (value === undefined) {
		element.removeAttribute(name);
		return;
	}
	if (element.getAttribute(name) === value) return;

	element.setAttribute(name, value);
}
