import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';

import type { SonicDial } from '#elements/dial.ts';
import type { SonicSlider } from '#elements/slider.ts';
import type { ValueSpec } from '#lib/value-mapping.ts';

import '#define/dial.ts';
import '#define/slider.ts';
import { parseNumberList } from '#lib/number-list.ts';
import { valueMapping } from '#lib/value-mapping.ts';

import { pressKey } from './helpers.ts';

type Write =
	| { key: string; kind: 'key' }
	| { kind: 'attribute'; name: string; value: string | undefined }
	| { kind: 'connect' }
	| { kind: 'disconnect' }
	| { kind: 'property'; value: number }
	| { kind: 'reset' };

function attribute(name: string, values: ReadonlyArray<string | undefined>): fc.Arbitrary<Write> {
	return fc.constantFrom(...values).map((value) => ({ kind: 'attribute', name, value }));
}

const valueChoices = ['-20', '0', '0.4', '4', '33', '60', '150', '359'];

function writesFor(isDial: boolean): fc.Arbitrary<Array<Write>> {
	const write = fc.oneof(
		attribute('min', ['-10', '0', '5', undefined]),
		attribute('max', ['3', '50', '100', '200', '360', undefined]),
		attribute('step', ['0', '0.5', '1', '3', undefined]),
		attribute('value', [...valueChoices, undefined]),
		attribute('positions', ['1 2 4 8', '0 50 200', '-5 5', '0 0.5 90 180 270', undefined]),
		attribute('taper', ['log', undefined]),
		attribute('notched', ['', undefined]),
		...(isDial ? [attribute('endless', ['', undefined])] : []),
		fc
			.constantFrom(...valueChoices)
			.map((value): Write => ({ kind: 'property', value: Number(value) })),
		fc
			.constantFrom('ArrowRight', 'ArrowLeft', 'PageUp', 'Home', 'End')
			.map((key): Write => ({ key, kind: 'key' })),
		fc.constantFrom<Write>({ kind: 'connect' }, { kind: 'disconnect' }, { kind: 'reset' }),
	);

	return fc.array(write, { maxLength: 12 });
}

type Host = SonicDial | SonicSlider;

interface Mirror {
	asked: number | undefined;
	attributes: HTMLElement;
}

function numberOr(attributes: HTMLElement, name: string, fallback: number): number {
	const text = attributes.getAttribute(name)?.trim();
	const value = text ? Number(text) : NaN;

	return Number.isFinite(value) ? value : fallback;
}

function specOf(attributes: HTMLElement): ValueSpec {
	const positions = parseNumberList(attributes.getAttribute('positions'));

	return {
		isNotched: attributes.hasAttribute('notched'),
		isWrapping: attributes.hasAttribute('endless'),
		max: numberOr(attributes, 'max', 100),
		min: numberOr(attributes, 'min', 0),
		step: numberOr(attributes, 'step', 1),
		taper: attributes.getAttribute('taper') === 'log' ? 'log' : 'linear',
		...(positions ? { positions } : {}),
	};
}

function expected({ asked, attributes }: Mirror): number {
	const fallback = numberOr(attributes, 'value', numberOr(attributes, 'min', 0));

	return valueMapping(specOf(attributes)).snap(asked ?? fallback);
}

// Removing an attribute that isn't set fires no `attributeChangedCallback`, so the element keeps its value
function writeAttribute(
	host: Host,
	mirror: Mirror,
	{ name, value }: { name: string; value: string | undefined },
): void {
	if (value === undefined && !mirror.attributes.hasAttribute(name)) return;

	const elements = [host, mirror.attributes];

	if (value === undefined) for (const element of elements) element.removeAttribute(name);
	else for (const element of elements) element.setAttribute(name, value);
	if (name === 'value') mirror.asked = undefined;
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
			writeAttribute(host, mirror, write);
			break;
		}
		case 'connect': {
			document.body.append(host);
			break;
		}
		case 'disconnect': {
			host.remove();
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

for (const tag of ['sonic-slider', 'sonic-dial'] as const) {
	test.prop([writesFor(tag === 'sonic-dial')], { numRuns: 1500 })(
		`${tag}: the value is the last one written or keyed, snapped under the spec, whatever the order`,
		(writes) => {
			document.body.replaceChildren();

			const host: Host = document.createElement(tag);
			const mirror: Mirror = { asked: undefined, attributes: document.createElement('div') };
			let hasConnected = false;

			for (const write of writes) {
				apply(host, mirror, write);
				hasConnected = hasConnected || write.kind === 'connect';
				if (hasConnected) expect(host.value).toBe(expected(mirror));
			}

			document.body.append(host);
			expect(host.value).toBe(expected(mirror));
		},
	);
}
