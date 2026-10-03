import { afterEach, expect, test, vi } from 'vitest';

import type { SonicRangeElement } from '#elements/range-element.ts';
import type { SonicSlider } from '#elements/slider.ts';
import type { SonicSum } from '#elements/sum.ts';

import '#define/dial.ts';
import '#define/number.ts';
import '#define/slider.ts';
import '#define/sum.ts';

import { nextTask, pointerAt, pressKey } from './helpers.ts';

afterEach(() => {
	document.body.replaceChildren();
});

async function mountSum(
	attributes: string,
	children: string,
): Promise<{ members: Array<SonicRangeElement>; sum: SonicSum }> {
	document.body.innerHTML = `<sonic-sum ${attributes}>${children}</sonic-sum>`;
	await nextTask();

	const sum = document.querySelector('sonic-sum');
	if (!sum) throw new Error('The sum did not render');

	const members = [
		...sum.querySelectorAll<SonicRangeElement>('sonic-dial, sonic-number, sonic-slider'),
	];

	return { members, sum };
}

function sliders(...values: Array<number | string>): string {
	return values
		.map((value) =>
			typeof value === 'number' ? `<sonic-slider value="${String(value)}"></sonic-slider>` : value,
		)
		.join('');
}

function valuesOf(members: Array<SonicRangeElement>): Array<number> {
	return members.map((member) => member.value);
}

function capOf(slider: SonicRangeElement): HTMLElement {
	const control = slider.querySelector<HTMLElement>('.sonic-slider');
	const cap = slider.querySelector<HTMLElement>('.sonic-slider-cap');
	if (!control || !cap) throw new Error('The slider did not render');

	vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 220, 40));
	vi.spyOn(cap, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 20, 40));

	return cap;
}

function xAt(value: number): number {
	return 10 + value * 2;
}

async function drag(slider: SonicRangeElement, toValues: Array<number>): Promise<void> {
	const cap = capOf(slider);

	pointerAt(cap, 'pointerdown', { clientX: xAt(slider.value) });
	for (const value of toValues) {
		pointerAt(cap, 'pointermove', { clientX: xAt(value) });
		await Promise.resolve();
	}
	pointerAt(cap, 'pointerup', { clientX: xAt(toValues.at(-1) ?? slider.value) });
	await Promise.resolve();
}

function recordTargets(target: EventTarget, members: Array<SonicRangeElement>): Array<string> {
	const events: Array<string> = [];

	for (const type of ['input', 'change']) {
		target.addEventListener(type, (event) => {
			events.push(`${type} ${String(members.indexOf(event.target as SonicRangeElement))}`);
		});
	}

	return events;
}

test('a drag on one member moves the others by their share, and each fires on the host', async () => {
	const { members, sum } = await mountSum('', sliders(50, 30, 20));
	const events = recordTargets(sum, members);
	const [first] = members;
	if (!first) throw new Error('No member');

	await drag(first, [70]);

	expect(valuesOf(members)).toEqual([70, 18, 12]);
	expect(events).toEqual(['input 0', 'input 1', 'input 2', 'change 0', 'change 1', 'change 2']);
});

test('a drag out and back before release restores the siblings and fires no change', async () => {
	const { members, sum } = await mountSum('', sliders(50, 30, 20));
	const events = recordTargets(sum, members);
	const [first] = members;
	if (!first) throw new Error('No member');

	await drag(first, [100, 50]);

	expect(valuesOf(members)).toEqual([50, 30, 20]);
	expect(events.filter((event) => event.startsWith('change'))).toEqual([]);
});

test('a locked member holds its value, stops the mover, and cannot be dragged itself', async () => {
	const { members } = await mountSum(
		'',
		sliders(50, '<sonic-slider data-sonic-locked value="30"></sonic-slider>', 20),
	);
	const [first, second] = members;
	if (!first || !second) throw new Error('No member');

	await drag(first, [100]);
	expect(valuesOf(members)).toEqual([70, 30, 0]);

	await drag(second, [60]);
	expect(valuesOf(members)).toEqual([70, 30, 0]);
});

test('a script write on a locked member lands, the others make room, and it stays locked', async () => {
	const { members } = await mountSum(
		'',
		sliders(50, '<sonic-slider data-sonic-locked value="30"></sonic-slider>', 20),
	);
	const [first, second] = members;
	if (!first || !second) throw new Error('No member');

	second.value = 40;
	await nextTask();
	expect(valuesOf(members)).toEqual([43, 40, 17]);

	await drag(second, [60]);
	expect(second.value).toBe(40);

	await drag(first, [100]);
	expect(valuesOf(members)).toEqual([60, 40, 0]);
});

test('a member unlocked again moves on the next drag', async () => {
	const { members } = await mountSum(
		'',
		sliders(50, '<sonic-slider data-sonic-locked value="30"></sonic-slider>', 20),
	);
	const [, second] = members;
	if (!second) throw new Error('No member');

	delete second.dataset.sonicLocked;
	await nextTask();
	await drag(second, [40]);

	expect(valuesOf(members)).toEqual([43, 40, 17]);
});

test('a dial, a slider and a number box hold the total together', async () => {
	const { members } = await mountSum(
		'',
		'<sonic-dial value="50"></sonic-dial><sonic-slider value="30"></sonic-slider><sonic-number value="20"></sonic-number>',
	);
	const [dial] = members;
	const control = dial?.querySelector<HTMLElement>('.sonic-dial');
	if (!control) throw new Error('No dial');

	pressKey(control, 'PageUp');

	expect(valuesOf(members)).toEqual([60, 24, 16]);
});

test('a member added later keeps its value and the others make room', async () => {
	const { sum } = await mountSum('', sliders(60, 40));

	sum.insertAdjacentHTML('beforeend', sliders(20));
	await nextTask();

	expect(valuesOf([...sum.querySelectorAll<SonicSlider>('sonic-slider')])).toEqual([48, 32, 20]);
});

test('mode set after upgrade chooses which sibling gives', async () => {
	const { members, sum } = await mountSum('', sliders(50, 30, 20));
	const [first] = members;
	if (!first) throw new Error('No member');

	sum.mode = 'cascade';
	await drag(first, [70]);

	expect(valuesOf(members)).toEqual([70, 10, 20]);
});

test('a property write moves the siblings and fires no change', async () => {
	const { members, sum } = await mountSum('', sliders(50, 30, 20));
	const events = recordTargets(sum, members);
	const [first] = members;
	if (!first) throw new Error('No member');

	first.value = 80;
	await Promise.resolve();

	expect(valuesOf(members)).toEqual([80, 12, 8]);
	expect(events).toEqual(['input 1', 'input 2']);
});

test('a total spreads at bind, and with none the members stay put', async () => {
	const spread = await mountSum('mode="equal" total="90"', sliders(20, 20, 20));

	expect(valuesOf(spread.members)).toEqual([30, 30, 30]);

	const kept = await mountSum('mode="equal"', sliders(20, 20, 20));

	expect(valuesOf(kept.members)).toEqual([20, 20, 20]);
});

test('a sum taken off the page lifts every limit', async () => {
	const { members, sum } = await mountSum(
		'',
		sliders(50, '<sonic-slider data-sonic-locked value="30"></sonic-slider>', 20),
	);
	const [first] = members;
	if (!first) throw new Error('No member');

	sum.remove();
	document.body.append(...members);
	await nextTask();
	await drag(first, [100]);

	expect(first.value).toBe(100);
});

test('a nested sum keeps its own members', async () => {
	const { sum } = await mountSum('', `${sliders(50, 50)}<sonic-sum>${sliders(30, 70)}</sonic-sum>`);
	const [outerFirst, , innerFirst] = [...sum.querySelectorAll<SonicSlider>('sonic-slider')];
	if (!outerFirst || !innerFirst) throw new Error('No member');

	await drag(outerFirst, [60]);
	await drag(innerFirst, [40]);

	expect(valuesOf([...sum.querySelectorAll<SonicSlider>('sonic-slider')])).toEqual([
		60, 40, 40, 60,
	]);
});

test('a fine mover among coarse siblings is held to what they can absorb, mid-drag too', async () => {
	const coarse = '<sonic-slider step="5" value="25"></sonic-slider>';
	const { members } = await mountSum('', sliders(50, coarse, coarse));
	const [first] = members;
	if (!first) throw new Error('No member');

	const cap = capOf(first);

	pointerAt(cap, 'pointerdown', { clientX: xAt(50) });
	pointerAt(cap, 'pointermove', { clientX: xAt(53) });
	await Promise.resolve();
	expect(valuesOf(members)).toEqual([50, 25, 25]);

	pointerAt(cap, 'pointermove', { clientX: xAt(55) });
	await Promise.resolve();
	expect(valuesOf(members)).toEqual([55, 25, 20]);

	pointerAt(cap, 'pointermove', { clientX: xAt(56) });
	await Promise.resolve();
	expect(valuesOf(members).reduce((total, value) => total + value, 0)).toBe(100);

	pointerAt(cap, 'pointerup', { clientX: xAt(56) });
	await Promise.resolve();
	expect(valuesOf(members).reduce((total, value) => total + value, 0)).toBe(100);
});

test('a total the members cannot reach saturates and warns once', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();
	const capped = '<sonic-slider max="20" value="10"></sonic-slider>';
	const { members, sum } = await mountSum('mode="equal" total="100"', sliders(capped, capped));

	expect(valuesOf(members)).toEqual([20, 20]);

	sum.mode = 'cascade';
	sum.mode = 'equal';

	expect(warn).toHaveBeenCalledTimes(1);
});
