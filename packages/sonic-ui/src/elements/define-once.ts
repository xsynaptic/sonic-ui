export function defineOnce(tag: string, elementClass: CustomElementConstructor): void {
	if (!customElements.get(tag)) customElements.define(tag, elementClass);
}
