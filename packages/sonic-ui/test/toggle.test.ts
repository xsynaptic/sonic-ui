import { expect, test, vi } from 'vitest';

import type { SonicToggle } from '#elements/toggle.ts';

import '#define/toggle.ts';

import { nextTask, pressKey } from './helpers.ts';

const abc = /* HTML */ `
	<span data-sonic-value="a">A</span>
	<span data-sonic-value="off">Off</span>
	<span data-sonic-value="b">B</span>
`;

const prePost = /* HTML */ `
	<span data-sonic-value="pre">Pre</span>
	<span data-sonic-value="post">Post</span>
`;

const wellStart = 100;
const stepPx = 24;

async function mountToggle(
	attributes: string,
	children = abc,
): Promise<{ control: SonicToggle; group: HTMLElement; positions: Array<HTMLButtonElement> }> {
	document.body.innerHTML = `<form><sonic-toggle ${attributes}>${children}</sonic-toggle></form>`;
	await nextTask();

	const control = document.querySelector('sonic-toggle');
	const group = control?.querySelector<HTMLElement>('.sonic-toggle');
	if (!control || !group) throw new Error('The toggle did not render');

	const positions = [...group.querySelectorAll('button')];
	const length = 32 + stepPx * (Math.max(positions.length, 2) - 1);
	const isVertical = control.orientation === 'vertical';
	const box = (start: number, size: number, cross: number): DOMRect =>
		isVertical
			? new DOMRect((32 - cross) / 2, start, cross, size)
			: new DOMRect(start, (32 - cross) / 2, size, cross);

	vi.spyOn(group, 'getBoundingClientRect').mockReturnValue(box(wellStart, length, 32));
	vi.spyOn(requirePart(group, '.sonic-toggle-well'), 'getBoundingClientRect').mockReturnValue(
		box(wellStart, length, 32),
	);
	vi.spyOn(requirePart(group, '.sonic-toggle-cap'), 'getBoundingClientRect').mockImplementation(
		() => box(wellStart + 2.5 + stepPx * capAt(group), 27, 27),
	);

	return { control, group, positions };
}

function requirePart(group: HTMLElement, selector: string): Element {
	const part = group.querySelector(selector);
	if (!part) throw new Error(`The toggle has no ${selector}`);

	return part;
}

function capAt(group: HTMLElement): number {
	return Number(group.style.getPropertyValue('--_sonic-toggle-at'));
}

function recordChanges(control: SonicToggle): Array<string> {
	const changes: Array<string> = [];

	control.parentElement?.addEventListener('change', () => {
		changes.push(control.value);
	});

	return changes;
}

function pointerAt(target: Element, type: string, at: [number, number] | number): void {
	const [clientX, clientY] = typeof at === 'number' ? [at, 16] : at;

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

function positionAt(positions: Array<HTMLButtonElement>, index: number): HTMLButtonElement {
	const position = positions[index];
	if (!position) throw new Error(`No position ${String(index)}`);

	return position;
}

function pressOn(group: HTMLElement, position: HTMLButtonElement, along: number): void {
	pointerAt(position, 'pointerdown', along);
	pointerAt(group, 'pointerup', along);
}

test('a drag that turns back before halfway changes nothing, and the cap settles where it was', async () => {
	const { control, group, positions } = await mountToggle('value="off"');
	const changes = recordChanges(control);

	pointerAt(positionAt(positions, 1), 'pointerdown', 150);
	pointerAt(group, 'pointermove', 161);
	expect(capAt(group)).toBeCloseTo(1 + 11 / stepPx, 9);

	pointerAt(group, 'pointermove', 150);
	pointerAt(group, 'pointerup', 150);

	expect(changes).toEqual([]);
	expect(capAt(group)).toBe(1);
});

test('a drag reports each crossing once, at the moment the cap passes halfway, and stops at the end', async () => {
	const { control, group, positions } = await mountToggle('value="off"');
	const changes = recordChanges(control);

	pointerAt(positionAt(positions, 1), 'pointerdown', 150);
	pointerAt(group, 'pointermove', 161);
	expect(changes).toEqual([]);

	for (const along of [163, 170, 400]) pointerAt(group, 'pointermove', along);
	expect(changes).toEqual(['b']);
	expect(capAt(group)).toBe(2);

	for (const along of [160, 137]) pointerAt(group, 'pointermove', along);
	expect(changes).toEqual(['b', 'off', 'a']);

	pointerAt(group, 'pointerup', 137);
	expect(capAt(group)).toBe(0);
});

test('a drag begun beside the cap brings the cap under the pointer', async () => {
	const { control, group, positions } = await mountToggle('value="a"');
	const changes = recordChanges(control);

	pointerAt(positionAt(positions, 2), 'pointerdown', 160);
	pointerAt(group, 'pointermove', 164);
	pointerAt(group, 'pointerup', 164);

	expect(changes).toEqual(['b']);
});

test.each([
	[0, 110, ['a']],
	[1, 140, []],
	[2, 170, ['b']],
])('a press on position %i of three goes there', async (index, along, expected) => {
	const { control, group, positions } = await mountToggle('value="off"');
	const changes = recordChanges(control);

	pressOn(group, positionAt(positions, index), along);

	expect(changes).toEqual(expected);
});

test.each([
	[0, 110],
	[1, 135],
])('a press on position %i of two flips it', async (index, along) => {
	const { control, group, positions } = await mountToggle('value="pre"', prePost);
	const changes = recordChanges(control);

	pressOn(group, positionAt(positions, index), along);
	pressOn(group, positionAt(positions, index), along);

	expect(changes).toEqual(['post', 'pre']);
});

test('a press that wobbles less than the drag threshold is still a press', async () => {
	const { control, group, positions } = await mountToggle('value="pre"', prePost);

	pointerAt(positionAt(positions, 0), 'pointerdown', 110);
	pointerAt(group, 'pointermove', 112);
	expect(capAt(group)).toBe(0);

	pointerAt(group, 'pointerup', 112);
	expect(control.value).toBe('post');
});

test('a press let go off the toggle changes nothing', async () => {
	const { control, group, positions } = await mountToggle('value="off"');
	const changes = recordChanges(control);

	pointerAt(positionAt(positions, 2), 'pointerdown', [170, 16]);
	pointerAt(group, 'pointerup', [171, 60]);

	expect(changes).toEqual([]);
});

test('a click with no pointer chooses its position, and the click a pointer sends after its press is ignored', async () => {
	const { control, group, positions } = await mountToggle('value="off"');
	const changes = recordChanges(control);

	positionAt(positions, 2).click();
	expect(changes).toEqual(['b']);

	pressOn(group, positionAt(positions, 0), 110);
	positionAt(positions, 1).dispatchEvent(
		new PointerEvent('click', { bubbles: true, pointerType: 'mouse' }),
	);
	expect(changes).toEqual(['b', 'a']);
});

test('the arrows stop at the ends rather than wrapping', async () => {
	const { control, positions } = await mountToggle('value="b"');
	const changes = recordChanges(control);
	const last = positionAt(positions, 2);

	last.focus();
	const event = pressKey(last, 'ArrowRight');

	expect(event.defaultPrevented).toBe(true);
	expect(changes).toEqual([]);

	pressKey(last, 'ArrowLeft');
	expect(changes).toEqual(['off']);
	expect(document.activeElement).toBe(positions[1]);
});

test('a disabled toggle ignores a press and a drag', async () => {
	const { control, group, positions } = await mountToggle('disabled value="off"');
	const changes = recordChanges(control);

	pressOn(group, positionAt(positions, 2), 170);
	pointerAt(positionAt(positions, 1), 'pointerdown', 140);
	pointerAt(group, 'pointermove', 170);
	pointerAt(group, 'pointerup', 170);

	expect(changes).toEqual([]);
	expect(capAt(group)).toBe(1);
});

test('disabling the toggle mid-drag stops the cap, and letting go settles it', async () => {
	const { control, group, positions } = await mountToggle('value="off"');

	pointerAt(positionAt(positions, 1), 'pointerdown', 140);
	pointerAt(group, 'pointermove', 150);
	control.disabled = true;
	pointerAt(group, 'pointermove', 170);
	pointerAt(group, 'pointerup', 170);

	expect(control.value).toBe('off');
	expect(capAt(group)).toBe(1);
});

test('a toggle with no positions is a switch that a press flips once, reporting its value', async () => {
	const { control, group, positions } = await mountToggle('name="sync" value="midi"', '');
	const bare = positionAt(positions, 0);
	const changes = recordChanges(control);

	expect(bare.getAttribute('role')).toBe('switch');
	expect(group.hasAttribute('role')).toBe(false);

	pressOn(group, bare, 130);
	bare.dispatchEvent(new PointerEvent('click', { bubbles: true, pointerType: 'mouse' }));

	expect(control.checked).toBe(true);
	expect(bare.getAttribute('aria-checked')).toBe('true');
	expect(control.hasAttribute('checked')).toBe(false);
	expect(changes).toEqual(['midi']);
	expect(capAt(group)).toBe(1);
});

test('a toggle with no positions and no value reports `on`, and a click with no pointer flips it', async () => {
	const { control, positions } = await mountToggle('', '');
	const changes = recordChanges(control);

	positionAt(positions, 0).click();

	expect(changes).toEqual(['on']);
});

test('a drag across halfway turns a toggle with no positions on, and back across turns it off', async () => {
	const { control, group, positions } = await mountToggle('', '');
	const changes: Array<boolean> = [];

	control.parentElement?.addEventListener('change', () => {
		changes.push(control.checked);
	});
	pointerAt(positionAt(positions, 0), 'pointerdown', 110);
	for (const along of [121, 123, 140, 121]) pointerAt(group, 'pointermove', along);
	pointerAt(group, 'pointerup', 121);

	expect(changes).toEqual([true, false]);
	expect(capAt(group)).toBe(0);
});

test('form reset returns a toggle with no positions to its attribute', async () => {
	const { control, group, positions } = await mountToggle('checked', '');

	pressOn(group, positionAt(positions, 0), 130);
	expect(control.checked).toBe(false);

	control.formResetCallback();
	expect(control.checked).toBe(true);
	expect(capAt(group)).toBe(1);
});

test('a vertical toggle reads the drag down the page, and its on is up', async () => {
	const three = await mountToggle('orientation="vertical" value="a"');

	pointerAt(positionAt(three.positions, 0), 'pointerdown', [16, 116]);
	pointerAt(three.group, 'pointermove', [90, 131]);
	expect(three.control.value).toBe('off');
	pointerAt(three.group, 'pointerup', [90, 131]);

	const bare = await mountToggle('checked orientation="vertical"', '');

	expect(capAt(bare.group)).toBe(0);
});

test('one child that is no position is drawn on the cap, and the positions keep their count', async () => {
	const { control, group, positions } = await mountToggle(
		'value="pre"',
		`<span class="sonic-led"></span>${prePost}`,
	);
	const cap = requirePart(group, '.sonic-toggle-cap');

	expect(cap.querySelectorAll('.sonic-led')).toHaveLength(1);
	expect(positions.map((position) => position.textContent.trim())).toEqual(['Pre', 'Post']);

	control.querySelector('.sonic-led')?.remove();
	await nextTask();

	expect(cap.childElementCount).toBe(0);
});

test('the first named position turns an on/off toggle into a radio group', async () => {
	const { control, group } = await mountToggle('checked', '<span class="sonic-led"></span>');
	const option = document.createElement('span');

	expect(group.querySelector('[role="switch"]')).not.toBeNull();

	option.dataset.sonicValue = 'x';
	control.append(option);
	await nextTask();

	expect(group.getAttribute('role')).toBe('radiogroup');
	expect(
		[...group.querySelectorAll('button')].map((button) => button.getAttribute('role')),
	).toEqual(['radio']);
	expect(capAt(group)).toBe(0);
});

test('legends outside warn once past three positions, and not at three', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	await mountToggle('legends="outside" value="off"');
	expect(warn).not.toHaveBeenCalled();

	const { control } = await mountToggle(
		'legends="outside" value="off"',
		`${abc}<span data-sonic-value="c">C</span>`,
	);

	expect(warn).toHaveBeenCalledOnce();
	expect(warn.mock.calls[0]?.[0]).toContain('this one has 4');

	control.value = 'c';
	await nextTask();

	expect(warn).toHaveBeenCalledOnce();
});

const duck = /* HTML */ `
	<span data-sonic-momentary data-sonic-value="duck">Dck</span>
	<span data-sonic-value="off">Off</span>
	<span data-sonic-value="on">On</span>
`;

test('a press on a momentary position acts before the release, holds through a wobble and springs back', async () => {
	const { control, group, positions } = await mountToggle('value="on"', duck);
	const changes = recordChanges(control);

	pointerAt(positionAt(positions, 0), 'pointerdown', 110);
	expect(changes).toEqual(['duck']);
	expect(capAt(group)).toBe(0);

	pointerAt(group, 'pointermove', 170);
	expect(changes).toEqual(['duck']);

	pointerAt(group, 'pointerup', [170, 60]);
	expect(changes).toEqual(['duck', 'off']);
	expect(capAt(group)).toBe(1);
});

test('a drag across halfway holds a momentary position, and back across or letting go springs it', async () => {
	const { control, group, positions } = await mountToggle('value="off"', duck);
	const changes = recordChanges(control);

	pointerAt(positionAt(positions, 1), 'pointerdown', 140);
	pointerAt(group, 'pointermove', 127);
	expect(changes).toEqual(['duck']);

	pointerAt(group, 'pointermove', 140);
	pointerAt(group, 'pointermove', 127);
	pointerAt(group, 'pointerup', 127);

	expect(changes).toEqual(['duck', 'off', 'duck', 'off']);
	expect(capAt(group)).toBe(1);
});

test('a press on either half of a two-position toggle holds its momentary position', async () => {
	const children = /* HTML */ `
		<span data-sonic-value="off">Off</span>
		<span data-sonic-momentary data-sonic-value="tap">Tap</span>
	`;
	const { control, group, positions } = await mountToggle('value="off"', children);
	const changes = recordChanges(control);

	pointerAt(positionAt(positions, 0), 'pointerdown', 110);
	expect(changes).toEqual(['tap']);

	pointerAt(group, 'pointerup', 110);
	expect(changes).toEqual(['tap', 'off']);
});

test('a key holds a momentary position until it lifts, and disabling the toggle lets go', async () => {
	const { control, group, positions } = await mountToggle('value="off"', duck);
	const changes = recordChanges(control);
	const rest = positionAt(positions, 1);

	rest.focus();
	pressKey(rest, 'ArrowLeft');
	expect(changes).toEqual(['duck']);
	expect(document.activeElement).toBe(positions[0]);

	group.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowLeft' }));
	expect(changes).toEqual(['duck', 'off']);
	expect(document.activeElement).toBe(rest);

	pointerAt(positionAt(positions, 0), 'pointerdown', 110);
	expect(control.value).toBe('duck');
	control.disabled = true;
	expect(control.value).toBe('off');
});

test('a drag stops at a disabled end position', async () => {
	const children = /* HTML */ `
		<span data-sonic-value="a">A</span>
		<span data-sonic-value="off">Off</span>
		<span data-sonic-disabled data-sonic-value="b">B</span>
	`;
	const { control, group, positions } = await mountToggle('value="off"', children);
	const changes = recordChanges(control);

	pointerAt(positionAt(positions, 1), 'pointerdown', 140);
	pointerAt(group, 'pointermove', 400);
	expect(capAt(group)).toBe(1);

	pointerAt(group, 'pointermove', -400);
	pointerAt(group, 'pointerup', -400);

	expect(changes).toEqual(['a']);
});

test('a drag passes a disabled middle position without reporting it', async () => {
	const children = /* HTML */ `
		<span data-sonic-value="a">A</span>
		<span data-sonic-disabled data-sonic-value="off">Off</span>
		<span data-sonic-value="b">B</span>
	`;
	const { control, group, positions } = await mountToggle('value="a"', children);
	const changes = recordChanges(control);

	pointerAt(positionAt(positions, 0), 'pointerdown', 116);
	pointerAt(group, 'pointermove', 140);
	expect(capAt(group)).toBe(1);
	expect(changes).toEqual([]);

	pointerAt(group, 'pointerup', 140);
	expect(capAt(group)).toBe(0);

	pointerAt(positionAt(positions, 0), 'pointerdown', 116);
	pointerAt(group, 'pointermove', 164);
	pointerAt(group, 'pointerup', 164);
	expect(changes).toEqual(['b']);
});

test('a two-position toggle with one position disabled ignores a press on either', async () => {
	const children = /* HTML */ `
		<span data-sonic-value="pre">Pre</span>
		<span data-sonic-disabled data-sonic-value="post">Post</span>
	`;
	const { control, group, positions } = await mountToggle('value="pre"', children);
	const changes = recordChanges(control);

	pressOn(group, positionAt(positions, 0), 110);
	pressOn(group, positionAt(positions, 1), 140);

	expect(changes).toEqual([]);
});
