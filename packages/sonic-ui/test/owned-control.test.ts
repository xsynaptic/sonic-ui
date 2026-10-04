import { expect, test } from 'vitest';

import '#define/meter.ts';
import '#define/number.ts';
import '#define/segmented.ts';
import '#define/xy.ts';

import { mountControl, nextTask } from './helpers.ts';

function styleOf(selector: string, name: string): string | undefined {
	return document.querySelector<HTMLElement>(selector)?.style.getPropertyValue(name);
}

function optionsOf(root: Element): Array<[string, boolean]> {
	return [...root.querySelectorAll('.sonic-segmented-cap')].map((cap) => [
		cap.textContent.trim(),
		cap.closest('button')?.getAttribute('aria-checked') === 'true',
	]);
}

test('a meter whose control is removed puts it back and draws on it', async () => {
	const { control, host } = mountControl('sonic-meter', 'min="20" max="120"');

	control.remove();
	await nextTask();
	host.value = 45;

	expect(host.querySelector('.sonic-meter')).toBe(control);
	expect(styleOf('sonic-meter > .sonic-meter', '--_sonic-meter-bar')).toBe('0.25');
});

test('an XY pad emptied by innerHTML puts its control back and draws on it', async () => {
	const { control, host } = mountControl('sonic-xy', 'x-min="-50" x-max="50" y-max="10"');

	host.replaceChildren();
	await nextTask();
	host.x = 25;

	expect(host.querySelector('.sonic-xy')).toBe(control);
	expect(styleOf('sonic-xy > .sonic-xy', '--_sonic-xy-x')).toBe('0.75');
});

test('a morph back to server HTML that held a stale control leaves the one live control', async () => {
	const { control, host } = mountControl('sonic-xy', '');

	host.innerHTML = '<div class="sonic-xy"><div class="sonic-xy-puck"></div></div>';
	await nextTask();

	expect([...host.children]).toEqual([control]);
});

test('a morph that replaces the options of a segmented control leaves one group, redrawn', async () => {
	const { control, host } = mountControl(
		'sonic-segmented',
		'value="bp"',
		'<span data-sonic-value="lp">LP</span><span data-sonic-value="bp">BP</span>',
	);

	await nextTask();
	host.innerHTML =
		'<span data-sonic-value="bp">Band</span><span data-sonic-value="hp">High</span><div class="sonic-segmented"></div>';
	await nextTask();

	expect([...host.querySelectorAll('.sonic-segmented')]).toEqual([control]);
	expect(optionsOf(control)).toEqual([
		['Band', true],
		['High', false],
	]);
});

test('a number box parsed from its own outerHTML holds one control showing its value', async () => {
	const { host } = mountControl('sonic-number', 'min="10" max="90" step="5" value="35"');

	document.body.innerHTML = host.outerHTML;
	await nextTask();

	const controls = document.querySelectorAll('.sonic-number');

	expect(controls).toHaveLength(1);
	expect(controls[0]?.getAttribute('aria-valuenow')).toBe('35');
	expect(controls[0]).not.toBe(host.querySelector('.sonic-number'));
});

test('a segmented control parsed from its own outerHTML holds one group and one copy of each option', async () => {
	const { host } = mountControl(
		'sonic-segmented',
		'value="hp"',
		'<span data-sonic-value="lp">LP</span><span data-sonic-value="hp">HP</span>',
	);

	await nextTask();
	document.body.innerHTML = host.outerHTML;
	await nextTask();

	expect(document.querySelectorAll('.sonic-segmented')).toHaveLength(1);
	expect(optionsOf(document.body)).toEqual([
		['LP', false],
		['HP', true],
	]);
});
