import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';

import type { SonicXy } from '#elements/xy.ts';
import type { FieldAxis } from '#lib/field.ts';
import type { ValueSpec } from '#lib/value-mapping.ts';

import '#define/xy.ts';
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
	| { axis: FieldAxis; kind: 'property'; value: number | undefined }
	| { key: string; kind: 'key' }
	| { kind: 'reset' };

const axes = ['x', 'y'] as const;

const keyAxes = new Map<string, [FieldAxis, string]>([
	['ArrowDown', ['y', 'ArrowDown']],
	['ArrowRight', ['x', 'ArrowRight']],
	['End', ['x', 'PageUp']],
	['Home', ['x', 'PageDown']],
	['PageUp', ['y', 'PageUp']],
]);

const valueChoices = ['-20', '0', '0.4', '4', '33', '60', '150'];

const steps = stepsOf<Write>([
	{ arbitrary: fc.constant<Write>({ kind: 'reset' }), weight: 3 },
	{
		arbitrary: fc.constantFrom(...keyAxes.keys()).map((key): Write => ({ key, kind: 'key' })),
		weight: 6,
	},
	...axes.flatMap((axis) => [
		attributeWrite(`${axis}-min`, ['-10', '0', '5', undefined]),
		attributeWrite(`${axis}-max`, ['3', '50', '200', undefined]),
		attributeWrite(`${axis}-step`, ['0', '0.5', '3', undefined]),
		attributeWrite(axis, [...valueChoices, undefined]),
		fc.constantFrom(...valueChoices, undefined).map((value): Write => ({
			axis,
			kind: 'property',
			value: value === undefined ? value : Number(value),
		})),
	]),
	attributeWrite('x-taper', ['log', undefined]),
	attributeWrite('y-midpoint', ['10', '40', undefined]),
]);

interface Mirror {
	asked: Record<FieldAxis, number | undefined>;
	attributes: HTMLElement;
}

function specOf(attributes: HTMLElement, axis: FieldAxis): ValueSpec {
	const midpoint = attributes.getAttribute(`${axis}-midpoint`);

	return {
		isNotched: false,
		isWrapping: false,
		max: numberAttribute(attributes, `${axis}-max`, 100),
		min: numberAttribute(attributes, `${axis}-min`, 0),
		step: numberAttribute(attributes, `${axis}-step`, 1),
		taper: attributes.getAttribute(`${axis}-taper`) === 'log' ? 'log' : 'linear',
		...(midpoint === null ? {} : { midpoint: Number(midpoint) }),
	};
}

function expected({ asked, attributes }: Mirror, axis: FieldAxis): number {
	const fallback = numberAttribute(attributes, axis, numberAttribute(attributes, `${axis}-min`, 0));

	return valueMapping(specOf(attributes, axis)).snap(asked[axis] ?? fallback);
}

function apply(host: SonicXy, mirror: Mirror, write: Write): void {
	switch (write.kind) {
		case 'attribute': {
			if (
				didMirrorAttribute(host, mirror.attributes, write) &&
				(write.name === 'x' || write.name === 'y')
			) {
				mirror.asked[write.name] = undefined;
			}
			break;
		}
		case 'key': {
			const control = host.querySelector<HTMLElement>('.sonic-xy');
			const [axis, axisKey] = keyAxes.get(write.key) ?? ['x', write.key];
			if (!control || !host.isConnected) return;

			const from = expected(mirror, axis);

			pressKey(control, write.key);
			mirror.asked[axis] = valueMapping(specOf(mirror.attributes, axis)).keyTarget(axisKey, from);
			break;
		}
		case 'property': {
			host[write.axis] = write.value;
			mirror.asked[write.axis] = write.value;
			break;
		}
		case 'reset': {
			host.formResetCallback();
			mirror.asked = { x: undefined, y: undefined };
			break;
		}
	}
}

test.prop([steps], { numRuns: 1000 })(
	'sonic-xy: each axis is the last value written or keyed to it, snapped under its spec, whatever the order, and a connected control speaks both',
	async (writes) => {
		document.body.replaceChildren();

		const host = document.createElement('sonic-xy');
		const mirror: Mirror = {
			asked: { x: undefined, y: undefined },
			attributes: document.createElement('div'),
		};

		await runSteps(host, writes, {
			apply: (write) => {
				apply(host, mirror, write);
			},
			check: () => {
				for (const axis of axes) {
					const value = expected(mirror, axis);

					expect(host[axis]).toBe(value);
					if (!host.isConnected) continue;

					const part = host.querySelector(`[data-sonic-axis="${CSS.escape(axis)}"]`);

					expect(part?.getAttribute('aria-valuenow')).toBe(String(value));
				}
			},
		});
	},
);
