declare const __DEV__: boolean;

export function defineOnce(tag: string, elementClass: CustomElementConstructor): void {
	const registered = customElements.get(tag);

	if (registered === elementClass) return;

	if (registered) {
		if (__DEV__) {
			console.warn(
				`<${tag}> is already registered by another class, so this copy of sonic-ui never runs; two copies of the package are probably loaded`,
			);
		}
		return;
	}

	customElements.define(tag, elementClass);
}
