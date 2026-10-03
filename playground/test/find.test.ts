import { beforeEach, expect, test } from 'vitest';

import { dataHook, find, readControls } from '#scripts/find.ts';

beforeEach(() => {
	document.body.innerHTML = /* HTML */ `
		<section>
			<button data-play="play"></button>
			<input data-high-cut="cut" />
		</section>
	`;
});

test('find returns a match of the given type, and throws on any other', () => {
	expect(() => find(document, '[data-play]', HTMLInputElement)).toThrow(TypeError);
	expect(find(document, '[data-play]', HTMLButtonElement).localName).toBe('button');
});

test('find throws on a missing match', () => {
	expect(() => find(document, '[data-stop]', HTMLElement)).toThrow('[data-stop]');
});

test('readControls keys each match by its name, camel case to a kebab hook', () => {
	const section = find(document, 'section', HTMLElement);
	const controls = readControls(
		section,
		{ highCut: HTMLInputElement, play: HTMLButtonElement },
		dataHook,
	);

	expect(controls.highCut.dataset.highCut).toBe('cut');
	expect(controls.play.dataset.play).toBe('play');
	expect(() => readControls(section, { play: HTMLInputElement }, dataHook)).toThrow(TypeError);
});
