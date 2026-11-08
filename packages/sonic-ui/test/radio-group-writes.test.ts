import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';

import type { SonicSegmented } from '#elements/segmented.ts';
import type { SonicSwitch } from '#elements/switch.ts';
import type { SonicToggle } from '#elements/toggle.ts';

import '#define/segmented.ts';
import '#define/switch.ts';
import '#define/toggle.ts';

import type { AttributeWrite, Step } from './write-sequence.ts';

import { pressKey } from './helpers.ts';
import { attributeWrite, didMirrorAttribute, runSteps, stepsOf } from './write-sequence.ts';

type Write =
	| AttributeWrite
	| { isChecked: boolean; kind: 'checked' }
	| { key: string; kind: 'key' }
	| { kind: 'click' }
	| { kind: 'reset' }
	| { kind: 'value'; value: string };

interface Option {
	isDisabled: boolean;
	value: string;
}

type Host = SonicSegmented | SonicSwitch | SonicToggle;

type Tag = 'sonic-segmented' | 'sonic-switch' | 'sonic-toggle';

interface Case {
	isWrapping: boolean;
	options: fc.Arbitrary<Array<Option>>;
	tag: Tag;
}

interface Mirror {
	attributes: HTMLElement;
	checked: boolean | undefined;
	isWrapping: boolean;
	options: ReadonlyArray<Option>;
	value: string;
}

const valueChoices = ['a', 'b', 'c', 'z'];

function optionsOf(lengths: { maxLength: number; minLength: number }): fc.Arbitrary<Array<Option>> {
	return fc.uniqueArray(
		fc.record(
			{
				isDisabled: fc.oneof({ arbitrary: fc.constant(false), weight: 3 }, fc.constant(true)),
				value: fc.constantFrom('a', 'b', 'c', 'd'),
			},
			{ noNullPrototype: true },
		),
		{ ...lengths, selector: (option) => option.value },
	);
}

const positionOptions = fc.oneof(
	fc.constant<Array<Option>>([]),
	optionsOf({ maxLength: 3, minLength: 2 }),
);

const cases: ReadonlyArray<Case> = [
	{ isWrapping: true, options: optionsOf({ maxLength: 4, minLength: 2 }), tag: 'sonic-segmented' },
	{ isWrapping: false, options: positionOptions, tag: 'sonic-toggle' },
	{ isWrapping: false, options: positionOptions, tag: 'sonic-switch' },
];

function stepsFor(tag: Tag): fc.Arbitrary<Array<Step<Write>>> {
	const isPositionGroup = tag !== 'sonic-segmented';

	return stepsOf<Write>([
		{ arbitrary: fc.constant<Write>({ kind: 'reset' }), weight: 3 },
		{
			arbitrary: fc
				.constantFrom('ArrowRight', 'ArrowLeft', 'ArrowDown', 'Home', 'End')
				.map((key): Write => ({ key, kind: 'key' })),
			weight: 6,
		},
		attributeWrite('value', [...valueChoices, undefined]),
		fc.constantFrom(...valueChoices).map((value): Write => ({ kind: 'value', value })),
		attributeWrite('disabled', ['', undefined]),
		...(isPositionGroup
			? [
					attributeWrite('checked', ['', undefined]),
					attributeWrite('orientation', ['horizontal', 'vertical', undefined]),
					fc.boolean().map((isChecked): Write => ({ isChecked, kind: 'checked' })),
					{ arbitrary: fc.constant<Write>({ kind: 'click' }), weight: 3 },
				]
			: []),
	]);
}

function isChecked({ attributes, checked }: Mirror): boolean {
	return checked ?? attributes.hasAttribute('checked');
}

function checkedIndex(mirror: Mirror, tag: Tag): number {
	if (mirror.options.length > 0)
		return mirror.options.findIndex(({ value }) => value === mirror.value);

	const orientation = mirror.attributes.getAttribute('orientation');
	const isVertical =
		orientation === 'vertical' || (orientation !== 'horizontal' && tag === 'sonic-switch');
	const onIndex = isVertical ? 0 : 1;

	return isChecked(mirror) ? onIndex : 1 - onIndex;
}

function enabledIndexes(mirror: Mirror): Array<number> {
	if (mirror.attributes.hasAttribute('disabled')) return [];

	return mirror.options.flatMap(({ isDisabled }, index) => (isDisabled ? [] : [index]));
}

function tabStop(mirror: Mirror): number | undefined {
	const enabled = enabledIndexes(mirror);
	const checked = mirror.options.findIndex(({ value }) => value === mirror.value);

	return enabled.includes(checked) ? checked : enabled[0];
}

function stepped(mirror: Mirror, from: number, direction: number): number {
	const enabled = enabledIndexes(mirror);
	const count = mirror.options.length;

	for (let distance = 1; distance < count; distance += 1) {
		const index = from + direction * distance;
		const at = mirror.isWrapping ? (index + count) % count : index;

		if (enabled.includes(at)) return at;
	}

	return from;
}

function keyed(mirror: Mirror, from: number, key: string): number {
	if (key === 'Home') return enabledIndexes(mirror)[0] ?? from;
	if (key === 'End') return enabledIndexes(mirror).at(-1) ?? from;

	return stepped(mirror, from, key === 'ArrowLeft' ? -1 : 1);
}

function writeAttribute(host: Host, mirror: Mirror, write: AttributeWrite): void {
	if (!didMirrorAttribute(host, mirror.attributes, write)) return;

	if (write.name === 'value') mirror.value = write.value ?? '';
	else if (write.name === 'checked') mirror.checked = undefined;
}

function clickBare(host: Host, mirror: Mirror): void {
	const bare = host.querySelector<HTMLElement>('[role="switch"]');
	if (!bare || !host.isConnected || mirror.attributes.hasAttribute('disabled')) return;

	bare.click();
	mirror.checked = !isChecked(mirror);
}

function pressOn(host: Host, mirror: Mirror, key: string): void {
	const from = tabStop(mirror);
	const option = host.querySelectorAll<HTMLElement>('[role="radio"]')[from ?? -1];
	if (from === undefined || !option || !host.isConnected) return;

	pressKey(option, key);
	mirror.value = mirror.options[keyed(mirror, from, key)]?.value ?? mirror.value;
}

function apply(host: Host, mirror: Mirror, write: Write): void {
	switch (write.kind) {
		case 'attribute': {
			writeAttribute(host, mirror, write);
			break;
		}
		case 'checked': {
			if ('checked' in host) host.checked = write.isChecked;
			mirror.checked = write.isChecked;
			break;
		}
		case 'click': {
			clickBare(host, mirror);
			break;
		}
		case 'key': {
			pressOn(host, mirror, write.key);
			break;
		}
		case 'reset': {
			host.formResetCallback();
			mirror.value = mirror.attributes.getAttribute('value') ?? '';
			mirror.checked = undefined;
			break;
		}
		case 'value': {
			host.value = write.value;
			mirror.value = write.value;
			break;
		}
	}
}

function capAt(mirror: Mirror, tag: Tag): string | undefined {
	const index = checkedIndex(mirror, tag);
	const count = Math.max(2, mirror.options.length);

	if (tag === 'sonic-toggle') return String(Math.max(0, index));
	if (tag === 'sonic-switch') return String(index < 0 ? 0 : (2 * index) / (count - 1) - 1);

	return undefined;
}

function checkDrawn(host: Host, mirror: Mirror, tag: Tag): void {
	const control = host.querySelector<HTMLElement>(`.${tag}`);
	const at = control?.style.getPropertyValue(`--_${tag}-at`);

	if (tag !== 'sonic-segmented') expect(at).toBe(capAt(mirror, tag));
	if (mirror.options.length === 0) {
		expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe(
			String(isChecked(mirror)),
		);
		return;
	}

	const stop = tabStop(mirror);
	const drawn = [...host.querySelectorAll('[role="radio"]')].map((option) => [
		option.getAttribute('aria-checked'),
		option.getAttribute('tabindex'),
	]);

	expect(drawn).toStrictEqual(
		mirror.options.map(({ value }, index) => [
			String(value === mirror.value),
			index === stop ? '0' : '-1',
		]),
	);
}

for (const { isWrapping, options, tag } of cases) {
	test.prop([options, stepsFor(tag)], { numRuns: 800 })(
		`${tag}: the chosen position is the last one written, keyed or clicked, whatever the order, and a connected control draws it`,
		async (optionList, steps) => {
			document.body.replaceChildren();

			const host: Host = document.createElement(tag);
			const mirror: Mirror = {
				attributes: document.createElement('div'),
				checked: undefined,
				isWrapping,
				options: optionList,
				value: '',
			};

			for (const { isDisabled, value } of optionList) {
				const span = document.createElement('span');

				span.dataset.sonicValue = value;
				span.toggleAttribute('data-sonic-disabled', isDisabled);
				span.textContent = value.toUpperCase();
				host.append(span);
			}

			await runSteps(host, steps, {
				apply: (write) => {
					apply(host, mirror, write);
				},
				check: () => {
					const isBare = optionList.length === 0;

					expect(host.value).toBe(isBare && mirror.value === '' ? 'on' : mirror.value);
					if (isBare && 'checked' in host) expect(host.checked).toBe(isChecked(mirror));
					if (host.isConnected) checkDrawn(host, mirror, tag);
				},
			});
		},
	);
}
