import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';

import type { SonicDial } from '#elements/dial.ts';
import type { SonicNumber } from '#elements/number.ts';
import type { SonicSlider } from '#elements/slider.ts';
import type { ValueSpec } from '#lib/value-mapping.ts';

import '#define/dial.ts';
import '#define/number.ts';
import '#define/slider.ts';
import { parseNumberList } from '#lib/number-list.ts';
import { valueMapping } from '#lib/value-mapping.ts';

import type { AttributeWrite } from './write-sequence.ts';

import { pressKey } from './helpers.ts';
import {
	attributeWrite,
	didMirrorAttribute,
	numberAttribute,
	runSteps,
	stepsOf,
} from './write-sequence.ts';

type Write =
	| AttributeWrite
	| { key: string; kind: 'key' }
	| { kind: 'property'; value: number }
	| { kind: 'reset' };

const valueChoices = ['-20', '0', '0.4', '4', '33', '60', '150', '359'];

function stepsFor(isEndless: boolean) {
	return stepsOf<Write>([
		{ arbitrary: fc.constant<Write>({ kind: 'reset' }), weight: 3 },
		{
			arbitrary: fc
				.constantFrom('ArrowRight', 'ArrowLeft', 'PageUp', 'Home', 'End')
				.map((key): Write => ({ key, kind: 'key' })),
			weight: 6,
		},
		attributeWrite('min', ['-10', '0', '5', undefined]),
		attributeWrite('max', ['3', '50', '100', '200', '360', undefined]),
		attributeWrite('step', ['0', '0.5', '1', '3', undefined]),
		attributeWrite('value', [...valueChoices, undefined]),
		attributeWrite('positions', ['1 2 4 8', '0 50 200', '-5 5', '0 0.5 90 180 270', undefined]),
		attributeWrite('taper', ['log', undefined]),
		attributeWrite('notched', ['', undefined]),
		...(isEndless ? [attributeWrite('endless', ['', undefined])] : []),
		fc
			.constantFrom(...valueChoices)
			.map((value): Write => ({ kind: 'property', value: Number(value) })),
	]);
}

type Host = SonicDial | SonicNumber | SonicSlider;

interface Mirror {
	asked: number | undefined;
	attributes: HTMLElement;
}

function specOf(attributes: HTMLElement): ValueSpec {
	const positions = parseNumberList(attributes.getAttribute('positions'));

	return {
		isNotched: attributes.hasAttribute('notched'),
		isWrapping: attributes.hasAttribute('endless'),
		max: numberAttribute(attributes, 'max', 100),
		min: numberAttribute(attributes, 'min', 0),
		step: numberAttribute(attributes, 'step', 1),
		taper: attributes.getAttribute('taper') === 'log' ? 'log' : 'linear',
		...(positions ? { positions } : {}),
	};
}

function expected({ asked, attributes }: Mirror): number {
	const fallback = numberAttribute(attributes, 'value', numberAttribute(attributes, 'min', 0));

	return valueMapping(specOf(attributes)).snap(asked ?? fallback);
}

function pressOn(host: Host, mirror: Mirror, key: string): void {
	const control = host.querySelector<HTMLElement>(`.${host.localName}`);
	if (!control || !host.isConnected) return;

	const from = expected(mirror);

	pressKey(control, key);
	mirror.asked = valueMapping(specOf(mirror.attributes)).keyTarget(key, from);
}

function apply(host: Host, mirror: Mirror, write: Write): void {
	switch (write.kind) {
		case 'attribute': {
			if (didMirrorAttribute(host, mirror.attributes, write) && write.name === 'value') {
				mirror.asked = undefined;
			}
			break;
		}
		case 'key': {
			pressOn(host, mirror, write.key);
			break;
		}
		case 'property': {
			host.value = write.value;
			mirror.asked = write.value;
			break;
		}
		case 'reset': {
			host.formResetCallback();
			mirror.asked = undefined;
			break;
		}
	}
}

for (const tag of ['sonic-slider', 'sonic-dial', 'sonic-number'] as const) {
	test.prop([stepsFor(tag === 'sonic-dial')], { numRuns: 500 })(
		`${tag}: the value is the last one written or keyed, snapped under the spec, whatever the order, and a connected control speaks it`,
		async (steps) => {
			document.body.replaceChildren();

			const host: Host = document.createElement(tag);
			const mirror: Mirror = { asked: undefined, attributes: document.createElement('div') };

			await runSteps(host, steps, {
				apply: (write) => {
					apply(host, mirror, write);
				},
				check: () => {
					const value = expected(mirror);

					expect(host.value).toBe(value);
					if (host.isConnected) {
						expect(host.querySelector(`.${tag}`)?.getAttribute('aria-valuenow')).toBe(
							String(value),
						);
					}
				},
			});
		},
	);
}
