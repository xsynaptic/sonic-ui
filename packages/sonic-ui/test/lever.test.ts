import { expect, test, vi } from 'vitest';

import type { SonicLever } from '#elements/lever.ts';

import '#define/lever.ts';

import { nextTask, pressKey } from './helpers.ts';

const duck = /* HTML */ `
	<span data-sonic-momentary data-sonic-value="duck">Duck</span>
	<span data-sonic-value="off">Off</span>
	<span data-sonic-value="on">On</span>
`;

async function mountLever(
	attributes: string,
	children = duck,
): Promise<{ group: HTMLElement; lever: SonicLever; positions: Array<HTMLButtonElement> }> {
	document.body.innerHTML = `<form><sonic-lever ${attributes}>${children}</sonic-lever></form>`;
	await nextTask();

	const lever = document.querySelector('sonic-lever');
	const group = lever?.querySelector<HTMLElement>('.sonic-lever');
	if (!lever || !group) throw new Error('The lever did not render');

	return { group, lever, positions: [...group.querySelectorAll('button')] };
}

function recordChanges(lever: SonicLever): Array<string> {
	const changes: Array<string> = [];

	lever.parentElement?.addEventListener('change', () => {
		changes.push(lever.value);
	});

	return changes;
}

function releaseKey(target: HTMLElement, key: string): void {
	target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key }));
}

function pointer(target: Element, type: string, pointerId = 1): void {
	target.dispatchEvent(
		new PointerEvent(type, { bubbles: true, button: 0, pointerId, pointerType: 'mouse' }),
	);
}

function positionAt(positions: Array<HTMLButtonElement>, index: number): HTMLButtonElement {
	const position = positions[index];
	if (!position) throw new Error(`No position ${String(index)}`);

	return position;
}

function throwOf(group: HTMLElement): string {
	return group.style.getPropertyValue('--_sonic-lever-at');
}

test('the arrows stop at the ends rather than wrapping', async () => {
	const { lever, positions } = await mountLever('value="on"');
	const changes = recordChanges(lever);
	const last = positionAt(positions, 2);

	last.focus();
	const event = pressKey(last, 'ArrowDown');

	expect(event.defaultPrevented).toBe(true);
	expect(lever.value).toBe('on');
	expect(changes).toEqual([]);
});

test.each([
	{ children: duck, expected: ['duck', 'off'], from: 'off', key: 'ArrowUp', target: 0 },
	{
		children: /* HTML */ `
			<span data-sonic-value="off">Off</span>
			<span data-sonic-value="on">On</span>
			<span data-sonic-momentary data-sonic-value="talk">Talk</span>
		`,
		expected: ['talk', 'on'],
		from: 'on',
		key: 'End',
		target: 2,
	},
])(
	'a key onto the momentary end at $target holds it, then springs back to its neighbour',
	async ({ children, expected, from, key, target }) => {
		const { group, lever, positions } = await mountLever(`value="${from}"`, children);
		const changes = recordChanges(lever);
		const start = positions.find((position) => position.tabIndex === 0);
		if (!start) throw new Error('No tab stop');

		start.focus();
		pressKey(start, key);
		expect(lever.value).toBe(expected[0]);
		expect(document.activeElement).toBe(positions[target]);

		releaseKey(group, key);

		expect(changes).toEqual(expected);
		expect(document.activeElement).toBe(positions[1]);
	},
);

test('a momentary position springs back from On to Off, not to where it was', async () => {
	const { group, lever, positions } = await mountLever('value="on"');
	const changes = recordChanges(lever);

	pointer(positionAt(positions, 0), 'pointerdown');
	pointer(group, 'pointerup');

	expect(changes).toEqual(['duck', 'off']);
});

test('a press on the momentary position acts before the release', async () => {
	const { group, lever, positions } = await mountLever('value="off"');
	const changes = recordChanges(lever);

	pointer(positionAt(positions, 0), 'pointerdown');
	expect(changes).toEqual(['duck']);
	expect(throwOf(group)).toBe('-1');

	pointer(group, 'pointercancel');
	expect(changes).toEqual(['duck', 'off']);
	expect(throwOf(group)).toBe('0');
});

test('a click with no pointer on the momentary position springs straight back', async () => {
	const { lever, positions } = await mountLever('value="on"');
	const changes = recordChanges(lever);

	positionAt(positions, 0).click();

	expect(changes).toEqual(['duck', 'off']);
});

test('another pointer lifting leaves the hold alone', async () => {
	const { group, lever, positions } = await mountLever('value="off"');

	pointer(positionAt(positions, 0), 'pointerdown', 1);
	pointer(group, 'pointerup', 2);

	expect(lever.value).toBe('duck');
});

test('removing the lever mid-hold springs it back and reports it', async () => {
	const { lever, positions } = await mountLever('value="off"');
	const changes: Array<string> = [];

	lever.addEventListener('change', () => {
		changes.push(lever.value);
	});
	pointer(positionAt(positions, 0), 'pointerdown');
	lever.remove();
	await nextTask();

	expect(changes).toEqual(['duck', 'off']);
});

test('disabling the lever mid-hold springs it back', async () => {
	const { lever, positions } = await mountLever('value="off"');

	pointer(positionAt(positions, 0), 'pointerdown');
	lever.disabled = true;

	expect(lever.value).toBe('off');
});

test('a middle position marked momentary latches', async () => {
	const children = /* HTML */ `
		<span data-sonic-value="a">A</span>
		<span data-sonic-momentary data-sonic-value="b">B</span>
		<span data-sonic-value="c">C</span>
	`;
	const { group, lever, positions } = await mountLever('value="a"', children);

	pointer(positionAt(positions, 1), 'pointerdown');
	expect(lever.value).toBe('a');

	pointer(group, 'pointerup');
	expect(lever.value).toBe('b');
});

test('a press on the checked side of a two-position lever flips it; on three it stays', async () => {
	const two = /* HTML */ `
		<span data-sonic-value="pre">Pre</span>
		<span data-sonic-value="post">Post</span>
	`;
	const flip = await mountLever('value="pre"', two);

	pointer(positionAt(flip.positions, 0), 'pointerdown');
	pointer(flip.group, 'pointerup');
	expect(flip.lever.value).toBe('post');
	expect(throwOf(flip.group)).toBe('1');

	const three = await mountLever('value="off"');

	pointer(positionAt(three.positions, 1), 'pointerdown');
	pointer(three.group, 'pointerup');
	expect(three.lever.value).toBe('off');
});

test('a bare lever is a switch that flips on click without writing `checked`', async () => {
	const { group, lever, positions } = await mountLever('name="sync" value="midi"', '');
	const toggle = positionAt(positions, 0);
	const changes = recordChanges(lever);

	expect(toggle.getAttribute('role')).toBe('switch');
	expect(group.hasAttribute('role')).toBe(false);
	expect(throwOf(group)).toBe('1');

	toggle.click();

	expect(lever.checked).toBe(true);
	expect(toggle.getAttribute('aria-checked')).toBe('true');
	expect(lever.hasAttribute('checked')).toBe(false);
	expect(changes).toEqual(['midi']);
	expect(throwOf(group)).toBe('-1');
});

test('a horizontal switch throws toward the end when on', async () => {
	const { group } = await mountLever('checked orientation="horizontal"', '');

	expect(throwOf(group)).toBe('1');
});

test('an unset value submits `on`, as a checkbox does', async () => {
	const { lever } = await mountLever('', '');

	expect(lever.value).toBe('on');
});

test('form reset returns a switch to its attribute', async () => {
	const { lever, positions } = await mountLever('checked', '');

	positionAt(positions, 0).click();
	expect(lever.checked).toBe(false);

	lever.formResetCallback();
	expect(lever.checked).toBe(true);
});

test('the first named position turns a switch into a radio group', async () => {
	const { group, lever } = await mountLever('', '');
	const option = document.createElement('span');

	option.dataset.sonicValue = 'x';
	lever.append(option);
	await nextTask();

	expect(group.getAttribute('role')).toBe('radiogroup');
	expect(
		[...group.querySelectorAll('button')].map((button) => button.getAttribute('role')),
	).toEqual(['radio']);
});

test('the throw is spread evenly across the positions', async () => {
	const { group, lever } = await mountLever('value="duck"');

	expect(throwOf(group)).toBe('-1');

	lever.value = 'off';
	expect(throwOf(group)).toBe('0');

	lever.value = 'on';
	expect(throwOf(group)).toBe('1');
});

function mockBat(group: HTMLElement): void {
	const bat = group.querySelector('.sonic-lever-bat');
	if (!bat) throw new Error('The lever has no bat');

	vi.spyOn(bat, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 40, 40));
}

function pointerAt(target: Element, type: string, [clientX, clientY]: [number, number]): void {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			button: 0,
			clientX,
			clientY,
			pointerId: 1,
			pointerType: 'mouse',
		}),
	);
}

const abc = /* HTML */ `
	<span data-sonic-value="a">A</span>
	<span data-sonic-value="off">Off</span>
	<span data-sonic-value="b">B</span>
`;

test.each([
	['off', 30, 'b'],
	['off', 8, 'a'],
	['off', 21, 'b'],
	['b', 30, 'off'],
	['a', 8, 'off'],
])('a press on the bat from %s at %ipx throws it to %s', async (from, clientY, expected) => {
	const { group, lever, positions } = await mountLever(`value="${from}"`, abc);

	mockBat(group);
	pointerAt(positionAt(positions, 1), 'pointerdown', [20, clientY]);
	pointerAt(group, 'pointerup', [20, clientY]);

	expect(lever.value).toBe(expected);
});

test('a drag on the bat throws one position per quarter of its size, and stops at the end', async () => {
	const { group, lever, positions } = await mountLever('value="b"', abc);
	const changes = recordChanges(lever);

	mockBat(group);
	pointerAt(positionAt(positions, 1), 'pointerdown', [20, 30]);
	for (const clientY of [21, 19, 11, 9, -20]) pointerAt(group, 'pointermove', [20, clientY]);
	pointerAt(group, 'pointerup', [20, -20]);

	expect(changes).toEqual(['off', 'a']);
});

test('a horizontal drag reads the pointer across, and a press outside the bat goes to its position', async () => {
	const { group, lever, positions } = await mountLever('orientation="horizontal" value="a"', abc);

	mockBat(group);
	pointerAt(positionAt(positions, 0), 'pointerdown', [5, 20]);
	pointerAt(group, 'pointermove', [16, 90]);
	expect(lever.value).toBe('off');
	pointerAt(group, 'pointerup', [16, 90]);

	pointerAt(positionAt(positions, 2), 'pointerdown', [60, 20]);
	pointerAt(group, 'pointerup', [60, 20]);
	expect(lever.value).toBe('b');
});

test('a drag onto a momentary position holds it, and dragging back or letting go springs it back', async () => {
	const { group, lever, positions } = await mountLever('value="off"');
	const changes = recordChanges(lever);

	mockBat(group);
	pointerAt(positionAt(positions, 1), 'pointerdown', [20, 20]);
	pointerAt(group, 'pointermove', [20, 9]);
	expect(lever.value).toBe('duck');
	pointerAt(group, 'pointermove', [20, 20]);
	expect(lever.value).toBe('off');
	pointerAt(group, 'pointermove', [20, 9]);
	pointerAt(group, 'pointerup', [20, 9]);

	expect(changes).toEqual(['duck', 'off', 'duck', 'off']);
});

test('a switch flips once on a bat press, though its own click follows', async () => {
	const { group, lever, positions } = await mountLever('', '');
	const toggle = positionAt(positions, 0);

	mockBat(group);
	pointerAt(toggle, 'pointerdown', [20, 20]);
	pointerAt(group, 'pointerup', [20, 20]);
	toggle.click();
	expect(lever.checked).toBe(true);

	await nextTask();
	toggle.click();
	expect(lever.checked).toBe(false);
});

test('a drag sets a switch by direction: on is up, or right when horizontal', async () => {
	const upright = await mountLever('checked', '');

	mockBat(upright.group);
	pointerAt(positionAt(upright.positions, 0), 'pointerdown', [20, 10]);
	pointerAt(upright.group, 'pointermove', [20, 0]);
	expect(upright.lever.checked).toBe(true);
	pointerAt(upright.group, 'pointermove', [20, 12]);
	expect(upright.lever.checked).toBe(false);
	pointerAt(upright.group, 'pointerup', [20, 12]);

	const across = await mountLever('orientation="horizontal"', '');

	mockBat(across.group);
	pointerAt(positionAt(across.positions, 0), 'pointerdown', [10, 20]);
	pointerAt(across.group, 'pointermove', [22, 20]);
	expect(across.lever.checked).toBe(true);
});
