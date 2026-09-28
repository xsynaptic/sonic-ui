import { expect, test } from 'vitest';

// @vitest-environment happy-dom
import type { SonicSegmented } from '#elements/segmented.ts';

import '#define/segmented.ts';

const options = /* HTML */ `
	<span data-sonic-value="lp">LP</span>
	<span data-sonic-value="bp">BP</span>
	<span data-sonic-value="hp">HP</span>
`;

function nextTask(): Promise<unknown> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

// happy-dom connects the element before parsing its children, so the options arrive through the observer
async function mountSegmented(attributes: string): Promise<{
	group: HTMLElement;
	segmented: SonicSegmented;
	segments: Array<HTMLButtonElement>;
}> {
	document.body.innerHTML = `<sonic-segmented ${attributes}>${options}</sonic-segmented>`;
	await nextTask();

	const segmented = document.querySelector('sonic-segmented');
	const group = segmented?.querySelector<HTMLElement>('.sonic-segmented');
	if (!segmented || !group) throw new Error('The switch did not render');

	return { group, segmented, segments: [...group.querySelectorAll('button')] };
}

function checked(segments: Array<HTMLButtonElement>): Array<null | string> {
	return segments.map((segment) => segment.getAttribute('aria-checked'));
}

function valueOf(segment: Element): string | undefined {
	return segment.querySelector<HTMLElement>('[data-sonic-value]')?.dataset.sonicValue;
}

function pressKey(target: HTMLElement, key: string): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key });

	target.dispatchEvent(event);

	return event;
}

function recordChanges(segmented: SonicSegmented): Array<string> {
	const changes: Array<string> = [];

	segmented.addEventListener('change', () => {
		changes.push(segmented.value);
	});

	return changes;
}

test('each option lands in its own segment cap, one appended later too, and other children stay put', async () => {
	const { group, segmented } = await mountSegmented('');
	const late = document.createElement('span');
	const plain = document.createElement('span');

	late.dataset.sonicValue = 'notch';
	segmented.append(late, plain);
	await nextTask();

	const caps = [
		...group.querySelectorAll(':scope > .sonic-segmented-segment > .sonic-segmented-cap'),
	];

	expect(caps.map((cap) => valueOf(cap))).toEqual(['lp', 'bp', 'hp', 'notch']);
	expect(group.getAttribute('role')).toBe('radiogroup');
	expect(plain.parentElement).toBe(segmented);
});

test('replacing the options rebuilds the group and latches the value among them', async () => {
	const { segmented } = await mountSegmented('value="bp"');
	const options = ['bp', 'notch'].map((value) => {
		const option = document.createElement('span');

		option.dataset.sonicValue = value;

		return option;
	});

	segmented.replaceChildren(...options);
	await nextTask();

	const segments = [...segmented.querySelectorAll<HTMLButtonElement>('.sonic-segmented-segment')];

	expect(segmented.querySelector(':scope > .sonic-segmented')).not.toBeNull();
	expect(segments.map((segment) => valueOf(segment))).toEqual(['bp', 'notch']);
	expect(checked(segments)).toEqual(['true', 'false']);
});

test('a click latches its segment and fires change once', async () => {
	const { segmented, segments } = await mountSegmented('value="lp"');
	const changes = recordChanges(segmented);

	segments[1]?.click();
	segments[1]?.click();

	expect(segmented.value).toBe('bp');
	expect(checked(segments)).toEqual(['false', 'true', 'false']);
	expect(changes).toEqual(['bp']);
});

test('a click on the label inside a cap latches its segment', async () => {
	const { segmented, segments } = await mountSegmented('value="lp"');

	segments[2]
		?.querySelector('[data-sonic-value]')
		?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

	expect(segmented.value).toBe('hp');
});

test('the attribute sets the value and the property never writes it back', async () => {
	const { segmented, segments } = await mountSegmented('value="hp"');

	expect(checked(segments)).toEqual(['false', 'false', 'true']);

	segmented.value = 'lp';
	expect(checked(segments)).toEqual(['true', 'false', 'false']);
	expect(segmented.getAttribute('value')).toBe('hp');

	segmented.setAttribute('value', 'bp');
	expect(segmented.value).toBe('bp');
	expect(checked(segments)).toEqual(['false', 'true', 'false']);

	segmented.value = 'none of them';
	expect(checked(segments)).toEqual(['false', 'false', 'false']);
});

test('a value set before the options arrive latches them once they do', async () => {
	const segmented = document.createElement('sonic-segmented');

	segmented.setAttribute('value', 'hp');
	document.body.replaceChildren(segmented);
	segmented.insertAdjacentHTML('beforeend', options);
	await nextTask();

	expect(checked([...segmented.querySelectorAll('button')])).toEqual(['false', 'false', 'true']);
});

test.each([
	['ArrowRight', 'bp', 'hp'],
	['ArrowDown', 'bp', 'hp'],
	['ArrowRight', 'hp', 'lp'],
	['ArrowLeft', 'bp', 'lp'],
	['ArrowUp', 'lp', 'hp'],
	['Home', 'hp', 'lp'],
	['End', 'lp', 'hp'],
])('%s from %s selects and focuses %s', async (key, from, expected) => {
	const { segmented, segments } = await mountSegmented(`value="${from}"`);
	const changes = recordChanges(segmented);
	const current = segments.find((segment) => segment.getAttribute('aria-checked') === 'true');
	if (!current) throw new Error('Nothing is latched');

	expect(pressKey(current, key).defaultPrevented).toBe(true);
	expect(segmented.value).toBe(expected);
	expect(changes).toEqual([expected]);
	expect(document.activeElement).toBe(segments.find((segment) => valueOf(segment) === expected));
});

test('a key the switch does not use keeps its default', async () => {
	const { segments } = await mountSegmented('value="lp"');
	const [first] = segments;
	if (!first) throw new Error('No segments');

	expect(pressKey(first, 'Tab').defaultPrevented).toBe(false);
});

test('a key already taken by a capture listener on the host leaves the value alone', async () => {
	const { segmented, segments } = await mountSegmented('value="lp"');
	const changes = recordChanges(segmented);
	const [first] = segments;
	if (!first) throw new Error('No segments');

	segmented.addEventListener(
		'keydown',
		(event) => {
			event.preventDefault();
		},
		{ capture: true },
	);
	pressKey(first, 'ArrowRight');

	expect(segmented.value).toBe('lp');
	expect(changes).toEqual([]);
});

test('only the latched segment is a tab stop, or the first while none is', async () => {
	const { segmented, segments } = await mountSegmented('');

	expect(segments.map((segment) => segment.tabIndex)).toEqual([0, -1, -1]);

	segmented.value = 'hp';
	expect(segments.map((segment) => segment.tabIndex)).toEqual([-1, -1, 0]);
});

test('disabled disables every segment, so a click no longer latches', async () => {
	const { segmented, segments } = await mountSegmented('disabled value="lp"');
	const changes = recordChanges(segmented);

	expect(segments.every((segment) => segment.disabled)).toBe(true);

	segments[2]?.click();
	expect(segmented.value).toBe('lp');
	expect(changes).toEqual([]);

	segmented.disabled = false;
	expect(segments.some((segment) => segment.disabled)).toBe(false);
});

test.each(['aria-describedby', 'aria-label', 'aria-labelledby'])(
	'%s is forwarded to the radio group as it is added, changed and removed',
	async (name) => {
		const { group, segmented } = await mountSegmented(`${name}="first"`);

		expect(group.getAttribute(name)).toBe('first');

		segmented.setAttribute(name, 'second');
		expect(group.getAttribute(name)).toBe('second');

		segmented.removeAttribute(name);
		expect(group.hasAttribute(name)).toBe(false);
	},
);
