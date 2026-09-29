import type { ReactNode } from 'react';

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test } from 'vitest';

import '#define/key.ts';
import '#define/segmented.ts';

import { nextTask } from './helpers.ts';

// React warns about updates outside `act` unless told it runs in a test
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

let root: ReturnType<typeof createRoot>;

beforeEach(() => {
	document.body.innerHTML = '<div id="root"></div>';

	const container = document.querySelector('#root');
	if (!container) throw new Error('The container is missing');

	root = createRoot(container);
});

afterEach(() => {
	act(() => {
		root.unmount();
	});
});

// The observer mirrors after the task that changed the children
async function render(node: ReactNode): Promise<void> {
	act(() => {
		root.render(node);
	});
	await nextTask();
}

function playKey(isPlaying: boolean, label?: string): ReactNode {
	const icon = createElement('svg', {
		'data-icon': isPlaying ? 'pause' : 'play',
		key: isPlaying ? 'pause' : 'play',
	});

	return createElement('sonic-key', { 'aria-label': 'Play' }, icon, label);
}

function modeSwitch(values: Array<string>): ReactNode {
	return createElement(
		'sonic-segmented',
		{ 'aria-label': 'Mode', value: 'lp' },
		values.map((value) => createElement('span', { 'data-sonic-value': value, key: value }, value)),
	);
}

function capOf(): string {
	const cap = document.querySelector('.sonic-key-cap');

	return [...(cap?.childNodes ?? [])]
		.map((node) => (node instanceof SVGElement ? node.dataset.icon : node.textContent))
		.join(' ');
}

function segmentValues(): Array<string | undefined> {
	return [
		...document.querySelectorAll<HTMLElement>('.sonic-segmented-cap > [data-sonic-value]'),
	].map((option) => option.dataset.sonicValue);
}

test('a key follows React as it swaps its icon and adds, changes and removes a label', async () => {
	await render(playKey(false));
	expect(capOf()).toBe('play');

	await render(playKey(true));
	expect(capOf()).toBe('pause');

	await render(playKey(true, 'Pause'));
	expect(capOf()).toBe('pause Pause');

	await render(playKey(true, 'Paused'));
	expect(capOf()).toBe('pause Paused');

	await render(playKey(true));
	expect(capOf()).toBe('pause');
});

test('a segmented switch follows React as it adds, removes and reorders keyed options', async () => {
	await render(modeSwitch(['lp', 'bp', 'hp']));
	expect(segmentValues()).toEqual(['lp', 'bp', 'hp']);

	await render(modeSwitch(['lp', 'bp', 'hp', 'notch']));
	expect(segmentValues()).toEqual(['lp', 'bp', 'hp', 'notch']);

	await render(modeSwitch(['lp', 'hp', 'notch']));
	expect(segmentValues()).toEqual(['lp', 'hp', 'notch']);

	await render(modeSwitch(['notch', 'hp', 'lp']));
	expect(segmentValues()).toEqual(['notch', 'hp', 'lp']);
	expect(document.querySelector('[aria-checked="true"] [data-sonic-value]')?.textContent).toBe(
		'lp',
	);
});
