import { expect, test } from 'vitest';

import type { SonicSegmented } from '#elements/segmented.ts';

import '#define/segmented.ts';

import { nextTask, pointerAt, pressKey } from './helpers.ts';

const options = /* HTML */ `
	<span data-sonic-value="lp">LP</span>
	<span data-sonic-value="bp">BP</span>
	<span data-sonic-value="hp">HP</span>
`;

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

function recordChanges(segmented: SonicSegmented): Array<string> {
	const changes: Array<string> = [];

	document.body.addEventListener('change', () => {
		changes.push(segmented.value);
	});

	return changes;
}

test('each option lands in its own segment cap, one appended later too, and other children render beside the group', async () => {
	const { group, segmented } = await mountSegmented('');
	const late = document.createElement('span');
	const plain = document.createElement('span');
	const status = document.createTextNode('Live');

	late.dataset.sonicValue = 'notch';
	segmented.append(late, plain, status);
	await nextTask();

	const caps = [
		...group.querySelectorAll(':scope > .sonic-segmented-segment > .sonic-segmented-cap'),
	];

	expect(caps.map((cap) => valueOf(cap))).toEqual(['lp', 'bp', 'hp', 'notch']);
	expect(group.getAttribute('role')).toBe('radiogroup');

	const rendered = segmented.shadowRoot?.querySelector('slot')?.assignedNodes() ?? [];

	expect(rendered).not.toContain(late);
	expect(rendered.slice(-3)).toEqual([plain, status, group]);
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

test('naming the switch keeps a value set by the property', async () => {
	const { segmented, segments } = await mountSegmented('value="lp"');

	segmented.value = 'hp';
	segmented.setAttribute('aria-label', 'Mode');

	expect(segmented.value).toBe('hp');
	expect(checked(segments)).toEqual(['false', 'false', 'true']);
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

test('aria-label is forwarded to the radio group as it is added, changed and removed', async () => {
	const { group, segmented } = await mountSegmented('aria-label="first"');

	expect(group.getAttribute('aria-label')).toBe('first');

	segmented.setAttribute('aria-label', 'second');
	expect(group.getAttribute('aria-label')).toBe('second');

	segmented.removeAttribute('aria-label');
	expect(group.hasAttribute('aria-label')).toBe(false);
});

test('writing the current value leaves the switch untouched', async () => {
	const { segmented } = await mountSegmented('value="bp"');
	const records: Array<MutationRecord> = [];
	const observer = new MutationObserver((batch) => {
		records.push(...batch);
	});

	observer.observe(segmented, {
		attributes: true,
		characterData: true,
		childList: true,
		subtree: true,
	});
	segmented.value = 'bp';

	expect([...records, ...observer.takeRecords()]).toEqual([]);
	observer.disconnect();
});

test('focus follows its option when the options are reordered', async () => {
	const { segmented } = await mountSegmented('value="lp"');
	const [lp] = segmented.querySelectorAll(':scope > [data-sonic-value]');

	segmented.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
	if (lp) segmented.append(lp);
	await nextTask();

	const focused = document.activeElement;

	expect(focused?.querySelector('[data-sonic-value]')?.textContent).toBe('LP');
	expect(focused?.getAttribute('aria-checked')).toBe('true');
});

test('removing the focused option moves focus to the tab stop', async () => {
	const { segmented } = await mountSegmented('value="bp"');

	segmented.querySelectorAll<HTMLButtonElement>('.sonic-segmented-segment')[2]?.focus();
	segmented.querySelector(':scope > [data-sonic-value="hp"]')?.remove();
	await nextTask();

	const focused = document.activeElement;

	expect(focused?.getAttribute('aria-checked')).toBe('true');
});

test('a change inside a child that is not an option leaves the copies alone', async () => {
	const { group, segmented } = await mountSegmented('');
	const status = document.createElement('span');

	segmented.append(status);
	await nextTask();

	const copy = group.querySelector('[data-sonic-value]');

	status.textContent = 'Live';
	await nextTask();

	expect(group.querySelector('[data-sonic-value]')).toBe(copy);
});

test('an option that loses its value leaves the group', async () => {
	const { group, segmented } = await mountSegmented('value="bp"');

	segmented.querySelector(':scope > [data-sonic-value="bp"]')?.removeAttribute('data-sonic-value');
	await nextTask();

	expect([...group.querySelectorAll('button')].map((segment) => valueOf(segment))).toEqual([
		'lp',
		'hp',
	]);
});

test('focus() reaches the tab stop, and leaves focus on another segment where it is', async () => {
	const { segmented, segments } = await mountSegmented('value="bp"');

	segmented.focus();
	expect(document.activeElement).toBe(segments[1]);

	segments[2]?.focus();
	segmented.focus();
	expect(document.activeElement).toBe(segments[2]);
});

function layOut(segments: Array<HTMLButtonElement>): void {
	for (const [index, segment] of segments.entries()) {
		segment.getBoundingClientRect = () => new DOMRect(index * 60, 0, 60, 20);
	}
}

function mouseAt(target: Element, type: string, clientX: number): void {
	pointerAt(target, type, { clientX, clientY: 10, pointerType: 'mouse' });
}

function held(segments: Array<HTMLButtonElement>): Array<boolean> {
	return segments.map((segment) => segment.dataset.sonicPressed !== undefined);
}

test('a press follows the pointer across segments and latches where it is released', async () => {
	const { group, segmented, segments } = await mountSegmented('value="lp"');
	const changes = recordChanges(segmented);

	layOut(segments);
	mouseAt(segments[0]?.firstElementChild ?? group, 'pointerdown', 30);
	expect(held(segments)).toEqual([true, false, false]);

	mouseAt(group, 'pointermove', 150);
	expect(held(segments)).toEqual([false, false, true]);
	expect(segmented.value).toBe('lp');

	mouseAt(group, 'pointerup', 150);
	mouseAt(segments[0] ?? group, 'click', 150);

	expect(segmented.value).toBe('hp');
	expect(changes).toEqual(['hp']);
	expect(held(segments)).toEqual([false, false, false]);
});

test('a press released off the switch latches nothing', async () => {
	const { group, segmented, segments } = await mountSegmented('value="lp"');
	const changes = recordChanges(segmented);

	layOut(segments);
	mouseAt(segments[1] ?? group, 'pointerdown', 90);
	mouseAt(group, 'pointermove', 400);
	expect(held(segments)).toEqual([false, false, false]);

	mouseAt(group, 'pointerup', 400);

	expect(segmented.value).toBe('lp');
	expect(changes).toEqual([]);
});

test('a disabled switch holds no press', async () => {
	const { group, segmented, segments } = await mountSegmented('disabled value="lp"');

	layOut(segments);
	mouseAt(segments[1] ?? group, 'pointerdown', 90);
	mouseAt(group, 'pointerup', 90);

	expect(held(segments)).toEqual([false, false, false]);
	expect(segmented.value).toBe('lp');
});
