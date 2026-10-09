import { expect, test } from 'vitest';

import type { SonicSegmented } from '#elements/segmented.ts';

import '#define/segmented.ts';

import { nextTask, pointerAt, pressKey } from './helpers.ts';

const optionMarkup = /* HTML */ `
	<span data-sonic-value="lp">LP</span>
	<span data-sonic-value="bp">BP</span>
	<span data-sonic-value="hp">HP</span>
`;

async function mountSegmented(attributes: string): Promise<{
	group: HTMLElement;
	options: Array<HTMLButtonElement>;
	segmented: SonicSegmented;
}> {
	document.body.innerHTML = `<sonic-segmented ${attributes}>${optionMarkup}</sonic-segmented>`;
	await nextTask();

	const segmented = document.querySelector('sonic-segmented');
	const group = segmented?.querySelector<HTMLElement>('.sonic-segmented');
	if (!segmented || !group) throw new Error('The segmented control did not render');

	return { group, options: [...group.querySelectorAll('button')], segmented };
}

function checked(options: Array<HTMLButtonElement>): Array<null | string> {
	return options.map((option) => option.getAttribute('aria-checked'));
}

function valueOf(option: Element): string | undefined {
	return option.querySelector<HTMLElement>('[data-sonic-value]')?.dataset.sonicValue;
}

function recordChanges(segmented: SonicSegmented): Array<string> {
	const changes: Array<string> = [];

	document.body.addEventListener('change', () => {
		changes.push(segmented.value);
	});

	return changes;
}

test('each option lands in its own cap, one appended later too, and other children render beside the group', async () => {
	const { group, segmented } = await mountSegmented('');
	const late = document.createElement('span');
	const plain = document.createElement('span');
	const status = document.createTextNode('Live');

	late.dataset.sonicValue = 'notch';
	segmented.append(late, plain, status);
	await nextTask();

	const caps = [
		...group.querySelectorAll(':scope > .sonic-segmented-option > .sonic-segmented-cap'),
	];

	expect(caps.map((cap) => valueOf(cap))).toEqual(['lp', 'bp', 'hp', 'notch']);

	const rendered = segmented.shadowRoot?.querySelector('slot')?.assignedNodes() ?? [];

	expect(rendered).not.toContain(late);
	expect(rendered.slice(-3)).toEqual([plain, status, group]);
});

test('replacing the options rebuilds the group and latches the value among them', async () => {
	const { segmented } = await mountSegmented('value="bp"');
	const children = ['bp', 'notch'].map((value) => {
		const child = document.createElement('span');

		child.dataset.sonicValue = value;

		return child;
	});

	segmented.replaceChildren(...children);
	await nextTask();

	const options = [...segmented.querySelectorAll<HTMLButtonElement>('.sonic-segmented-option')];

	expect(segmented.querySelector(':scope > .sonic-segmented')).not.toBeNull();
	expect(options.map((option) => valueOf(option))).toEqual(['bp', 'notch']);
	expect(checked(options)).toEqual(['true', 'false']);
});

test('a click latches its option and fires change once', async () => {
	const { options, segmented } = await mountSegmented('value="lp"');
	const changes = recordChanges(segmented);

	options[1]?.click();
	options[1]?.click();

	expect(segmented.value).toBe('bp');
	expect(checked(options)).toEqual(['false', 'true', 'false']);
	expect(changes).toEqual(['bp']);
});

test('a click on the label inside a cap latches its option', async () => {
	const { options, segmented } = await mountSegmented('value="lp"');

	options[2]
		?.querySelector('[data-sonic-value]')
		?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

	expect(segmented.value).toBe('hp');
});

test('the attribute sets the value and the property never writes it back', async () => {
	const { options, segmented } = await mountSegmented('value="hp"');

	expect(checked(options)).toEqual(['false', 'false', 'true']);

	segmented.value = 'lp';
	expect(checked(options)).toEqual(['true', 'false', 'false']);
	expect(segmented.getAttribute('value')).toBe('hp');

	segmented.setAttribute('value', 'bp');
	expect(segmented.value).toBe('bp');
	expect(checked(options)).toEqual(['false', 'true', 'false']);

	segmented.value = 'none of them';
	expect(checked(options)).toEqual(['false', 'false', 'false']);
});

test('naming the control keeps a value set by the property', async () => {
	const { options, segmented } = await mountSegmented('value="lp"');

	segmented.value = 'hp';
	segmented.setAttribute('aria-label', 'Mode');

	expect(segmented.value).toBe('hp');
	expect(checked(options)).toEqual(['false', 'false', 'true']);
});

test('a value set before the options arrive latches them once they do', async () => {
	const segmented = document.createElement('sonic-segmented');

	segmented.setAttribute('value', 'hp');
	document.body.replaceChildren(segmented);
	segmented.insertAdjacentHTML('beforeend', optionMarkup);
	await nextTask();

	expect(checked([...segmented.querySelectorAll('button')])).toEqual(['false', 'false', 'true']);
});

test.each([
	['ArrowRight', 'hp', 'lp'],
	['End', 'lp', 'hp'],
])('%s from %s selects and focuses %s', async (key, from, expected) => {
	const { options, segmented } = await mountSegmented(`value="${from}"`);
	const changes = recordChanges(segmented);
	const current = options.find((option) => option.getAttribute('aria-checked') === 'true');
	if (!current) throw new Error('Nothing is latched');

	expect(pressKey(current, key).defaultPrevented).toBe(true);
	expect(segmented.value).toBe(expected);
	expect(changes).toEqual([expected]);
	expect(document.activeElement).toBe(options.find((option) => valueOf(option) === expected));
});

test('a key the control does not use keeps its default', async () => {
	const { options } = await mountSegmented('value="lp"');
	const [first] = options;
	if (!first) throw new Error('No options');

	expect(pressKey(first, 'Tab').defaultPrevented).toBe(false);
});

test('a key already taken by a capture listener on the host leaves the value alone', async () => {
	const { options, segmented } = await mountSegmented('value="lp"');
	const changes = recordChanges(segmented);
	const [first] = options;
	if (!first) throw new Error('No options');

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

test('only the latched option is a tab stop, or the first while none is', async () => {
	const { options, segmented } = await mountSegmented('');

	expect(options.map((option) => option.tabIndex)).toEqual([0, -1, -1]);

	segmented.value = 'hp';
	expect(options.map((option) => option.tabIndex)).toEqual([-1, -1, 0]);
});

test('the host names the radio group, and disabled disables every option', async () => {
	const { group, options, segmented } = await mountSegmented(
		'disabled value="lp" aria-label="first"',
	);

	expect(group.getAttribute('aria-label')).toBe('first');
	expect(options.every((option) => option.disabled)).toBe(true);

	segmented.disabled = false;
	expect(options.some((option) => option.disabled)).toBe(false);
});

test('writing the current value leaves the control untouched', async () => {
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

	segmented.querySelectorAll<HTMLButtonElement>('.sonic-segmented-option')[2]?.focus();
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

	expect([...group.querySelectorAll('button')].map((option) => valueOf(option))).toEqual([
		'lp',
		'hp',
	]);
});

test('focus() reaches the tab stop, and leaves focus on another option where it is', async () => {
	const { options, segmented } = await mountSegmented('value="bp"');

	segmented.focus();
	expect(document.activeElement).toBe(options[1]);

	options[2]?.focus();
	segmented.focus();
	expect(document.activeElement).toBe(options[2]);
});

function layOut(options: Array<HTMLButtonElement>): void {
	for (const [index, option] of options.entries()) {
		option.getBoundingClientRect = () => new DOMRect(index * 60, 0, 60, 20);
	}
}

function mouseAt(target: Element, type: string, clientX: number): void {
	pointerAt(target, type, { clientX, clientY: 10, pointerType: 'mouse' });
}

function held(options: Array<HTMLButtonElement>): Array<boolean> {
	return options.map((option) => option.dataset.sonicActive !== undefined);
}

test('a press follows the pointer across options and latches where it is released', async () => {
	const { group, options, segmented } = await mountSegmented('value="lp"');
	const changes = recordChanges(segmented);

	layOut(options);
	mouseAt(options[0]?.firstElementChild ?? group, 'pointerdown', 30);
	expect(held(options)).toEqual([true, false, false]);

	mouseAt(group, 'pointermove', 150);
	expect(held(options)).toEqual([false, false, true]);
	expect(segmented.value).toBe('lp');

	mouseAt(group, 'pointerup', 150);
	mouseAt(options[0] ?? group, 'click', 150);

	expect(segmented.value).toBe('hp');
	expect(changes).toEqual(['hp']);
	expect(held(options)).toEqual([false, false, false]);
});

test('a press released off the control latches nothing', async () => {
	const { group, options, segmented } = await mountSegmented('value="lp"');
	const changes = recordChanges(segmented);

	layOut(options);
	mouseAt(options[1] ?? group, 'pointerdown', 90);
	mouseAt(group, 'pointermove', 400);
	expect(held(options)).toEqual([false, false, false]);

	mouseAt(group, 'pointerup', 400);

	expect(segmented.value).toBe('lp');
	expect(changes).toEqual([]);
});

test('a disabled control holds no press', async () => {
	const { group, options, segmented } = await mountSegmented('disabled value="lp"');

	layOut(options);
	mouseAt(options[1] ?? group, 'pointerdown', 90);
	mouseAt(group, 'pointerup', 90);

	expect(held(options)).toEqual([false, false, false]);
	expect(segmented.value).toBe('lp');
});

async function mountWithout(
	disabled: string,
	attributes: string,
): Promise<{
	group: HTMLElement;
	options: Array<HTMLButtonElement>;
	segmented: SonicSegmented;
}> {
	const mounted = await mountSegmented(attributes);

	mounted.segmented
		.querySelector(`:scope > [data-sonic-value="${CSS.escape(disabled)}"]`)
		?.toggleAttribute('data-sonic-disabled', true);
	await nextTask();
	await nextTask();

	return mounted;
}

test('marking a child later disables its option alone, and the arrows wrap past it', async () => {
	const { options, segmented } = await mountWithout('hp', 'value="bp"');
	const changes = recordChanges(segmented);
	const middle = options[1];
	if (!middle) throw new Error('No middle option');

	expect(options.map((option) => option.disabled)).toEqual([false, false, true]);

	middle.focus();
	pressKey(middle, 'ArrowRight');
	pressKey(document.activeElement as HTMLElement, 'End');

	expect(changes).toEqual(['lp', 'bp']);
});

test('the tab stop leaves a chosen option that is disabled for the first enabled one', async () => {
	const { options, segmented } = await mountWithout('lp', 'value="lp"');

	expect(segmented.value).toBe('lp');
	expect(options.map((option) => option.tabIndex)).toEqual([-1, 0, -1]);
});

test('a press on a disabled option, or one released over it, latches nothing', async () => {
	const { group, options, segmented } = await mountWithout('hp', 'value="lp"');
	const changes = recordChanges(segmented);

	layOut(options);
	mouseAt(options[1] ?? group, 'pointerdown', 90);
	mouseAt(group, 'pointermove', 150);
	expect(held(options)).toEqual([false, false, false]);
	mouseAt(group, 'pointerup', 150);

	mouseAt(options[2] ?? group, 'pointerdown', 150);
	mouseAt(group, 'pointerup', 150);

	expect(changes).toEqual([]);
});
