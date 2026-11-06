import { fc, test } from '@fast-check/vitest';
import { afterEach, expect } from 'vitest';

import type { SonicValueElement } from '#elements/value-element.ts';
import type { SplitMode } from '#lib/distribute.ts';

import '#define/slider.ts';
import '#define/split.ts';
import { valueMapping } from '#lib/value-mapping.ts';

import { nextTask, pressKey } from './helpers.ts';

afterEach(() => {
	document.body.replaceChildren();
});

type Action =
	| { at: number; key: string; kind: 'key' }
	| { at: number; kind: 'lock' }
	| { at: number; kind: 'write'; value: number }
	| { kind: 'mode'; mode: SplitMode };

const slot = fc.record(
	{
		max: fc.constantFrom(6, 10),
		step: fc.constantFrom(0.5, 1, 2, 3),
		value: fc.nat(10),
	},
	{ noNullPrototype: true },
);

const action = fc.oneof(
	fc.record(
		{
			at: fc.nat(),
			key: fc.constantFrom('ArrowRight', 'ArrowLeft', 'PageUp', 'Home', 'End'),
			kind: fc.constant('key'),
		},
		{ noNullPrototype: true },
	),
	fc.record({ at: fc.nat(), kind: fc.constant('lock') }, { noNullPrototype: true }),
	fc.record(
		{
			at: fc.nat(),
			kind: fc.constant('write'),
			value: fc.constantFrom(-1, 0, 1, 2.5, 3, 5, 6, 9, 11),
		},
		{ noNullPrototype: true },
	),
	fc.record(
		{
			kind: fc.constant('mode'),
			mode: fc.constantFrom<SplitMode>('cascade', 'equal', 'proportional'),
		},
		{ noNullPrototype: true },
	),
) satisfies fc.Arbitrary<Action>;

function sumOf(members: ReadonlyArray<SonicValueElement>): number {
	return members.reduce((total, member) => total + member.value, 0);
}

function act(split: HTMLElement, member: SonicValueElement | undefined, action: Action): void {
	switch (action.kind) {
		case 'key': {
			const control = member?.querySelector<HTMLElement>('.sonic-slider');

			if (control) pressKey(control, action.key);
			break;
		}
		case 'lock': {
			member?.toggleAttribute('data-sonic-locked');
			break;
		}
		case 'mode': {
			split.setAttribute('mode', action.mode);
			break;
		}
		case 'write': {
			if (member) member.value = action.value;
			break;
		}
	}
}

function expectHeld(
	members: ReadonlyArray<SonicValueElement>,
	held: ReadonlyArray<number | undefined>,
	written: SonicValueElement | undefined,
): void {
	for (const [index, member] of members.entries()) {
		const { max, min, step, value } = member;
		const mapping = valueMapping({
			isNotched: false,
			isWrapping: false,
			max,
			min,
			step,
			taper: 'linear',
		});
		const kept = held[index];

		expect(mapping.snap(value)).toBe(value);
		if (member !== written && kept !== undefined) expect(value).toBe(kept);
	}
}

test.prop([fc.array(slot, { maxLength: 4, minLength: 2 }), fc.array(action, { maxLength: 10 })], {
	numRuns: 300,
})(
	'whatever the members are asked, the split holds its total, each grid and every locked member',
	async (slots, actions) => {
		document.body.innerHTML = `<sonic-split>${slots
			.map(
				({ max, step, value }) =>
					`<sonic-slider max="${String(max)}" step="${String(step)}" value="${String(value)}"></sonic-slider>`,
			)
			.join('')}</sonic-split>`;
		await nextTask();

		const members = [...document.querySelectorAll<SonicValueElement>('sonic-slider')];
		const split = document.querySelector('sonic-split');
		if (!split) throw new Error('The split did not render');

		const total = sumOf(members);

		for (const action of actions) {
			const member = 'at' in action ? members[action.at % members.length] : undefined;
			const held = members.map((entry) =>
				'sonicLocked' in entry.dataset ? entry.value : undefined,
			);

			act(split, member, action);
			for (let tick = 0; tick < 3; tick += 1) await Promise.resolve();

			expect(sumOf(members)).toBeCloseTo(total, 9);
			expectHeld(members, held, action.kind === 'write' ? member : undefined);
		}
	},
);
