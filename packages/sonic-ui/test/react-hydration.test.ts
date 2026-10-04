import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';

import { act, createElement, Suspense, use } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, test } from 'vitest';

import { nextTask, recordEvents } from './helpers.ts';

// React warns about updates outside `act` unless told it runs in a test
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

let root: Root | undefined;

let gate: Promise<void> | undefined;

afterEach(() => {
	act(() => {
		root?.unmount();
	});
	root = undefined;
	gate = undefined;
});

function controls(label = 'Play'): ReactNode {
	return createElement(
		'main',
		undefined,
		createElement('sonic-button', { 'aria-label': 'Play', latching: '' }, label),
		createElement(
			'sonic-dial',
			{ 'aria-label': 'Cutoff', max: 90, min: 10 },
			createElement('span', { 'data-sonic-value': '10' }, 'Low'),
			createElement('span', { 'data-sonic-value': '90' }, 'High'),
		),
		createElement('sonic-meter', { 'aria-label': 'Level' }),
	);
}

function Gated(): ReactNode {
	if (gate) use(gate);

	return createElement('sonic-meter', { 'aria-label': 'Level' });
}

function boundary(): ReactNode {
	return createElement(
		'main',
		undefined,
		createElement(
			Suspense,
			{ fallback: createElement('p', undefined, 'Loading') },
			createElement(Gated),
		),
	);
}

function serverRender(node: ReactNode): HTMLElement {
	document.body.innerHTML = `<div id="root">${renderToString(node)}</div>`;

	const container = document.querySelector<HTMLElement>('#root');
	if (!container) throw new Error('The container is missing');

	return container;
}

async function hydrate(container: HTMLElement, node: ReactNode): Promise<Array<string>> {
	const recovered: Array<string> = [];

	await act(async () => {
		root = hydrateRoot(container, node, {
			onRecoverableError: (error) => {
				recovered.push(String(error));
			},
		});
		await nextTask();
	});

	return recovered;
}

async function register(): Promise<void> {
	await Promise.all([
		import('#define/button.ts'),
		import('#define/dial.ts'),
		import('#define/meter.ts'),
	]);
	await nextTask();
}

function drawn(container: Element): Array<number> {
	return ['.sonic-button', '.sonic-dial', '.sonic-scale-label', '.sonic-meter'].map(
		(selector) => container.querySelectorAll(selector).length,
	);
}

// Registration is once per file, so this case runs before the two that need it done
// happy-dom fires no `attributeChangedCallback` on upgrade; the playground's `late.spec.ts` asserts the dial's value
test('controls registered after hydration hydrate clean, work, and follow a later render', async () => {
	const container = serverRender(controls());
	const recovered = await hydrate(container, controls());
	const hosts = [...container.querySelectorAll('sonic-button, sonic-dial, sonic-meter')];

	await register();

	expect(recovered).toEqual([]);
	expect(drawn(container)).toEqual([1, 1, 2, 1]);
	expect(container.querySelector('.sonic-button-cap')?.textContent).toBe('Play');

	const events = recordEvents(container);

	container.querySelector<HTMLElement>('.sonic-button')?.click();
	expect(events).toEqual(['change']);

	await act(async () => {
		root?.render(controls('Pause'));
		await nextTask();
	});

	expect(recovered).toEqual([]);
	expect(drawn(container)).toEqual([1, 1, 2, 1]);
	expect(container.querySelector('.sonic-button-cap')?.textContent).toBe('Pause');
	expect([...container.querySelectorAll('sonic-button, sonic-dial, sonic-meter')]).toEqual(hosts);
});

test('controls registered before hydration mismatch, and React renders the root again on the client', async () => {
	await register();

	const container = serverRender(controls());
	const served = container.querySelector('sonic-meter');

	await nextTask();
	expect(drawn(container)).toEqual([1, 1, 2, 1]);

	const recovered = await hydrate(container, controls());

	expect(recovered).toHaveLength(1);
	expect(recovered[0]).toContain('Hydration failed');
	expect(drawn(container)).toEqual([1, 1, 2, 1]);
	expect(container.querySelector('sonic-meter')).not.toBe(served);
});

test('a boundary hydrating after registration recovers with one error and a new host', async () => {
	const boundaryData = new EventTarget();

	await register();

	const container = serverRender(boundary());
	const served = container.querySelector('sonic-meter');

	gate = new Promise<void>((resolve) => {
		boundaryData.addEventListener('load', () => {
			resolve();
		});
	});

	const recovered = await hydrate(container, boundary());

	expect(recovered).toEqual([]);
	expect(container.querySelector('sonic-meter')).toBe(served);
	expect(container.querySelectorAll('.sonic-meter')).toHaveLength(1);

	await act(async () => {
		gate = undefined;
		boundaryData.dispatchEvent(new Event('load'));
		await nextTask();
	});

	expect(recovered).toHaveLength(1);
	expect(recovered[0]).toContain('Hydration failed');
	expect(container.querySelector('sonic-meter')).not.toBe(served);
	expect(container.querySelectorAll('.sonic-meter')).toHaveLength(1);
	expect(container.querySelector('p')).toBeNull();
});
