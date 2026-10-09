import { test as base } from '@playwright/test';

export const strippedProject = 'stripped';

function strip(): void {
	Reflect.deleteProperty(ElementInternals.prototype, 'ariaLabelledByElements');
	Reflect.deleteProperty(Element.prototype, 'ariaLabelledByElements');
	Reflect.deleteProperty(Intl, 'DurationFormat');

	// Chrome 90 to 124 take a custom state only with the legacy dashes
	CustomStateSet.prototype.add = () => {
		throw new DOMException('A custom state needs the legacy dashes', 'SyntaxError');
	};

	const supports = CSS.supports.bind(CSS);

	CSS.supports = (query: string, value?: string) =>
		!/anchor-name|:state\(/.test(query) &&
		(value === undefined ? supports(query) : supports(query, value));
}

// The stripped project loads every page without what the library's old-browser guards stand in for
export const test = base.extend<{ stripped: undefined }>({
	stripped: [
		async ({ page }, use, testInfo) => {
			if (testInfo.project.name === strippedProject) await page.addInitScript(strip);
			await use(undefined);
		},
		{ auto: true },
	],
});
