import { test as base } from '@playwright/test';

export const strippedProject = 'stripped';

function strip(): void {
	Reflect.deleteProperty(ElementInternals.prototype, 'ariaLabelledByElements');
	Reflect.deleteProperty(Element.prototype, 'ariaLabelledByElements');
	Reflect.deleteProperty(Intl, 'DurationFormat');

	for (const name of ['fillStyle', 'strokeStyle'] as const) {
		const style = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, name);

		Object.defineProperty(CanvasRenderingContext2D.prototype, name, {
			...style,
			set(this: CanvasRenderingContext2D, next: CanvasGradient | CanvasPattern | string) {
				if (typeof next === 'string' && next.includes('color-mix(')) return;

				style?.set?.call(this, next);
			},
		});
	}

	const supports = CSS.supports.bind(CSS);

	CSS.supports = (query: string, value?: string) =>
		!query.includes('anchor-name') &&
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
