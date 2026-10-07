import { expect, test, vi } from 'vitest';

import type { SonicSwitch } from '#elements/switch.ts';

import '#define/switch.ts';

import { nextTask, pressKey } from './helpers.ts';

const duck = /* HTML */ `
	<span data-sonic-momentary data-sonic-value="duck">Duck</span>
	<span data-sonic-value="off">Off</span>
	<span data-sonic-value="on">On</span>
`;

async function mountSwitch(
	attributes: string,
	children = duck,
): Promise<{ control: SonicSwitch; group: HTMLElement; positions: Array<HTMLButtonElement> }> {
	document.body.innerHTML = `<form><sonic-switch ${attributes}>${children}</sonic-switch></form>`;
	await nextTask();

	const control = document.querySelector('sonic-switch');
	const group = control?.querySelector<HTMLElement>('.sonic-switch');
	if (!control || !group) throw new Error('The switch did not render');

	return { control, group, positions: [...group.querySelectorAll('button')] };
}

function recordChanges(control: SonicSwitch): Array<string> {
	const changes: Array<string> = [];

	control.parentElement?.addEventListener('change', () => {
		changes.push(control.value);
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
	return group.style.getPropertyValue('--_sonic-switch-at');
}

test('the arrows stop at the ends rather than wrapping', async () => {
	const { control, positions } = await mountSwitch('value="on"');
	const changes = recordChanges(control);
	const last = positionAt(positions, 2);

	last.focus();
	const event = pressKey(last, 'ArrowDown');

	expect(event.defaultPrevented).toBe(true);
	expect(control.value).toBe('on');
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
		const { control, group, positions } = await mountSwitch(`value="${from}"`, children);
		const changes = recordChanges(control);
		const start = positions.find((position) => position.tabIndex === 0);
		if (!start) throw new Error('No tab stop');

		start.focus();
		pressKey(start, key);
		expect(control.value).toBe(expected[0]);
		expect(document.activeElement).toBe(positions[target]);

		releaseKey(group, key);

		expect(changes).toEqual(expected);
		expect(document.activeElement).toBe(positions[1]);
	},
);

test('a momentary position springs back from On to Off, not to where it was', async () => {
	const { control, group, positions } = await mountSwitch('value="on"');
	const changes = recordChanges(control);

	pointer(positionAt(positions, 0), 'pointerdown');
	pointer(group, 'pointerup');

	expect(changes).toEqual(['duck', 'off']);
});

test('a press on the momentary position acts before the release', async () => {
	const { control, group, positions } = await mountSwitch('value="off"');
	const changes = recordChanges(control);

	pointer(positionAt(positions, 0), 'pointerdown');
	expect(changes).toEqual(['duck']);
	expect(throwOf(group)).toBe('-1');

	pointer(group, 'pointercancel');
	expect(changes).toEqual(['duck', 'off']);
	expect(throwOf(group)).toBe('0');
});

test('a click with no pointer on the momentary position springs straight back', async () => {
	const { control, positions } = await mountSwitch('value="on"');
	const changes = recordChanges(control);

	positionAt(positions, 0).click();

	expect(changes).toEqual(['duck', 'off']);
});

test('another pointer lifting leaves the hold alone', async () => {
	const { control, group, positions } = await mountSwitch('value="off"');

	pointer(positionAt(positions, 0), 'pointerdown', 1);
	pointer(group, 'pointerup', 2);

	expect(control.value).toBe('duck');
});

test('removing the switch mid-hold springs it back and reports it', async () => {
	const { control, positions } = await mountSwitch('value="off"');
	const changes: Array<string> = [];

	control.addEventListener('change', () => {
		changes.push(control.value);
	});
	pointer(positionAt(positions, 0), 'pointerdown');
	control.remove();
	await nextTask();

	expect(changes).toEqual(['duck', 'off']);
});

test('disabling the switch mid-hold springs it back', async () => {
	const { control, positions } = await mountSwitch('value="off"');

	pointer(positionAt(positions, 0), 'pointerdown');
	control.disabled = true;

	expect(control.value).toBe('off');
});

test('a middle position marked momentary latches', async () => {
	const children = /* HTML */ `
		<span data-sonic-value="a">A</span>
		<span data-sonic-momentary data-sonic-value="b">B</span>
		<span data-sonic-value="c">C</span>
	`;
	const { control, group, positions } = await mountSwitch('value="a"', children);

	pointer(positionAt(positions, 1), 'pointerdown');
	expect(control.value).toBe('a');

	pointer(group, 'pointerup');
	expect(control.value).toBe('b');
});

test('a press on the checked side of a two-position switch flips it; on three it stays', async () => {
	const two = /* HTML */ `
		<span data-sonic-value="pre">Pre</span>
		<span data-sonic-value="post">Post</span>
	`;
	const flip = await mountSwitch('value="pre"', two);

	pointer(positionAt(flip.positions, 0), 'pointerdown');
	pointer(flip.group, 'pointerup');
	expect(flip.control.value).toBe('post');
	expect(throwOf(flip.group)).toBe('1');

	const three = await mountSwitch('value="off"');

	pointer(positionAt(three.positions, 1), 'pointerdown');
	pointer(three.group, 'pointerup');
	expect(three.control.value).toBe('off');
});

test('a bare switch is a switch that flips on click without writing `checked`', async () => {
	const { control, group, positions } = await mountSwitch('name="sync" value="midi"', '');
	const bare = positionAt(positions, 0);
	const changes = recordChanges(control);

	expect(bare.getAttribute('role')).toBe('switch');
	expect(group.hasAttribute('role')).toBe(false);
	expect(throwOf(group)).toBe('1');

	bare.click();

	expect(control.checked).toBe(true);
	expect(bare.getAttribute('aria-checked')).toBe('true');
	expect(control.hasAttribute('checked')).toBe(false);
	expect(changes).toEqual(['midi']);
	expect(throwOf(group)).toBe('-1');
});

test('a horizontal switch throws toward the end when on', async () => {
	const { group } = await mountSwitch('checked orientation="horizontal"', '');

	expect(throwOf(group)).toBe('1');
});

test('form reset returns a switch to its attribute', async () => {
	const { control, positions } = await mountSwitch('checked', '');

	positionAt(positions, 0).click();
	expect(control.checked).toBe(false);

	control.formResetCallback();
	expect(control.checked).toBe(true);
});

test('the first named position turns a switch into a radio group', async () => {
	const { control, group } = await mountSwitch('', '');
	const option = document.createElement('span');

	option.dataset.sonicValue = 'x';
	control.append(option);
	await nextTask();

	expect(group.getAttribute('role')).toBe('radiogroup');
	expect(
		[...group.querySelectorAll('button')].map((button) => button.getAttribute('role')),
	).toEqual(['radio']);
});

test('the throw is spread evenly across the positions', async () => {
	const names = ['off', 'low', 'mid', 'high'];
	const { control, group } = await mountSwitch(
		'value="off"',
		names.map((name) => `<span data-sonic-value="${name}">${name}</span>`).join(''),
	);
	const throws = names.map((name) => {
		control.value = name;

		return Number(throwOf(group));
	});

	expect(throws[0]).toBe(-1);
	expect(throws[1]).toBeCloseTo(-1 / 3, 9);
	expect(throws[2]).toBeCloseTo(1 / 3, 9);
	expect(throws[3]).toBe(1);
});

function mockBat(group: HTMLElement): void {
	const bat = group.querySelector('.sonic-switch-bat');
	if (!bat) throw new Error('The switch has no bat');

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
	const { control, group, positions } = await mountSwitch(`value="${from}"`, abc);

	mockBat(group);
	pointerAt(positionAt(positions, 1), 'pointerdown', [20, clientY]);
	pointerAt(group, 'pointerup', [20, clientY]);

	expect(control.value).toBe(expected);
});

test('a drag on the bat throws one position per quarter of its size, and stops at the end', async () => {
	const { control, group, positions } = await mountSwitch('value="b"', abc);
	const changes = recordChanges(control);

	mockBat(group);
	pointerAt(positionAt(positions, 1), 'pointerdown', [20, 30]);
	for (const clientY of [21, 19, 11, 9, -20]) pointerAt(group, 'pointermove', [20, clientY]);
	pointerAt(group, 'pointerup', [20, -20]);

	expect(changes).toEqual(['off', 'a']);
});

test('a horizontal drag reads the pointer across, and a press outside the bat goes to its position', async () => {
	const { control, group, positions } = await mountSwitch(
		'orientation="horizontal" value="a"',
		abc,
	);

	mockBat(group);
	pointerAt(positionAt(positions, 0), 'pointerdown', [5, 20]);
	pointerAt(group, 'pointermove', [16, 90]);
	expect(control.value).toBe('off');
	pointerAt(group, 'pointerup', [16, 90]);

	pointerAt(positionAt(positions, 2), 'pointerdown', [60, 20]);
	pointerAt(group, 'pointerup', [60, 20]);
	expect(control.value).toBe('b');
});

test('a drag onto a momentary position holds it, and dragging back or letting go springs it back', async () => {
	const { control, group, positions } = await mountSwitch('value="off"');
	const changes = recordChanges(control);

	mockBat(group);
	pointerAt(positionAt(positions, 1), 'pointerdown', [20, 20]);
	pointerAt(group, 'pointermove', [20, 9]);
	expect(control.value).toBe('duck');
	pointerAt(group, 'pointermove', [20, 20]);
	expect(control.value).toBe('off');
	pointerAt(group, 'pointermove', [20, 9]);
	pointerAt(group, 'pointerup', [20, 9]);

	expect(changes).toEqual(['duck', 'off', 'duck', 'off']);
});

test('a switch flips once on a bat press, however late its own click follows', async () => {
	const { control, group, positions } = await mountSwitch('', '');
	const bare = positionAt(positions, 0);

	mockBat(group);
	pointerAt(bare, 'pointerdown', [20, 20]);
	pointerAt(group, 'pointerup', [20, 20]);
	await nextTask();
	pointerAt(bare, 'click', [20, 20]);
	expect(control.checked).toBe(true);

	pointerAt(bare, 'click', [20, 20]);
	expect(control.checked).toBe(false);
});

test('a key flips a switch after a bat press whose click never came', async () => {
	const { control, group, positions } = await mountSwitch('', '');
	const bare = positionAt(positions, 0);

	mockBat(group);
	pointerAt(bare, 'pointerdown', [20, 20]);
	pointerAt(group, 'pointerup', [20, 20]);
	bare.click();

	expect(control.checked).toBe(false);
});

test('disabling the switch mid-drag stops the bat', async () => {
	const { control, group, positions } = await mountSwitch('value="b"', abc);

	mockBat(group);
	pointerAt(positionAt(positions, 1), 'pointerdown', [20, 30]);
	control.disabled = true;
	pointerAt(group, 'pointermove', [20, 19]);

	expect(control.value).toBe('b');
});

test('a drag sets a switch by direction: on is up, or right when horizontal', async () => {
	const upright = await mountSwitch('checked', '');

	mockBat(upright.group);
	pointerAt(positionAt(upright.positions, 0), 'pointerdown', [20, 10]);
	pointerAt(upright.group, 'pointermove', [20, 0]);
	expect(upright.control.checked).toBe(true);
	pointerAt(upright.group, 'pointermove', [20, 12]);
	expect(upright.control.checked).toBe(false);
	pointerAt(upright.group, 'pointerup', [20, 12]);

	const across = await mountSwitch('orientation="horizontal"', '');

	mockBat(across.group);
	pointerAt(positionAt(across.positions, 0), 'pointerdown', [10, 20]);
	pointerAt(across.group, 'pointermove', [22, 20]);
	expect(across.control.checked).toBe(true);
});

test('a drag that keeps going the same way flips a switch once', async () => {
	const { control, group, positions } = await mountSwitch('', '');
	const flips: Array<boolean> = [];

	control.parentElement?.addEventListener('change', () => {
		flips.push(control.checked);
	});
	mockBat(group);
	pointerAt(positionAt(positions, 0), 'pointerdown', [20, 30]);
	for (const clientY of [19, 8, -3, 8]) pointerAt(group, 'pointermove', [20, clientY]);
	pointerAt(group, 'pointerup', [20, 8]);

	expect(flips).toEqual([true, false]);
});

test('a press on either label of a two-position switch holds its momentary position', async () => {
	const children = /* HTML */ `
		<span data-sonic-value="off">Off</span>
		<span data-sonic-momentary data-sonic-value="duck">Duck</span>
	`;
	const { control, group, positions } = await mountSwitch('value="off"', children);
	const changes = recordChanges(control);

	pointer(positionAt(positions, 0), 'pointerdown');
	expect(changes).toEqual(['duck']);

	pointer(group, 'pointerup');
	expect(changes).toEqual(['duck', 'off']);
});

const middleOut = /* HTML */ `
	<span data-sonic-value="a">A</span>
	<span data-sonic-disabled data-sonic-value="off">Off</span>
	<span data-sonic-value="b">B</span>
	<span data-sonic-disabled data-sonic-value="c">C</span>
`;

test('the bat skips a disabled position and stops before a disabled end, by drag and by press', async () => {
	const { control, group, positions } = await mountSwitch('value="a"', middleOut);
	const changes = recordChanges(control);

	mockBat(group);
	pointerAt(positionAt(positions, 0), 'pointerdown', [20, 5]);
	for (const clientY of [16, 27, 38]) pointerAt(group, 'pointermove', [20, clientY]);
	pointerAt(group, 'pointerup', [20, 38]);
	expect(changes).toEqual(['b']);

	pointerAt(positionAt(positions, 2), 'pointerdown', [20, 30]);
	pointerAt(group, 'pointerup', [20, 30]);
	expect(changes).toEqual(['b', 'a']);
});

test('a press on a disabled position passes it by', async () => {
	const { control, group, positions } = await mountSwitch('value="a"', middleOut);

	expect(positions.map((position) => position.disabled)).toEqual([false, true, false, true]);

	pointer(positionAt(positions, 1), 'pointerdown');
	pointer(group, 'pointerup');
	expect(control.value).toBe('a');
});

test.each(['data-sonic-disabled', 'data-sonic-disabled data-sonic-momentary'])(
	'a press on the rest label of a two-position switch leaves a position marked %s alone',
	async (marks) => {
		const children = /* HTML */ `
			<span data-sonic-value="off">Off</span>
			<span ${marks} data-sonic-value="on">On</span>
		`;
		const { control, group, positions } = await mountSwitch('value="off"', children);
		const changes = recordChanges(control);

		pointer(positionAt(positions, 0), 'pointerdown');
		pointer(group, 'pointerup');

		expect(changes).toEqual([]);
	},
);
