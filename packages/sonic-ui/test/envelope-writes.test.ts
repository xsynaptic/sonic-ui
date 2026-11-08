import { fc, test } from '@fast-check/vitest';
import { expect, test as plainTest, vi } from 'vitest';

import type { SonicEnvelope } from '#elements/envelope.ts';

import '#define/dial.ts';
import '#define/envelope.ts';
import '#define/slider.ts';

import type { AttributeWrite } from './write-sequence.ts';

import { attributeWrite, didMirrorAttribute, runSteps, stepsOf } from './write-sequence.ts';

type Write =
	| AttributeWrite
	| { id: string; kind: 'source-attribute'; name: string; value: string }
	| { id: string; kind: 'source-value'; value: number };

const sources = [
	{ attributes: { max: '10', step: '0.5' }, id: 'time', tag: 'sonic-slider' },
	{ attributes: { max: '200', min: '-5', step: '3' }, id: 'level', tag: 'sonic-slider' },
	{ attributes: { max: '20000', min: '20', taper: 'log' }, id: 'shape', tag: 'sonic-dial' },
] as const;

const ids = [...sources.map(({ id }) => id), 'absent', undefined];

const steps = stepsOf<Write>([
	...['attack', 'decay', 'sustain', 'release', 'attack-curve'].map((stage) => ({
		arbitrary: attributeWrite(stage, ids),
		weight: 2,
	})),
	attributeWrite('disabled', ['', undefined]),
	{
		arbitrary: fc
			.record(
				{
					id: fc.constantFrom(...sources.map(({ id }) => id)),
					value: fc.constantFrom(-5, 0, 0.7, 4, 9, 150, 3000),
				},
				{ noNullPrototype: true },
			)
			.map((write): Write => ({ ...write, kind: 'source-value' })),
		weight: 4,
	},
	fc
		.record(
			{
				id: fc.constantFrom(...sources.map(({ id }) => id)),
				name: fc.constantFrom('disabled', 'max'),
				value: fc.constantFrom('', '6', '400'),
			},
			{ noNullPrototype: true },
		)
		.map((write): Write => ({ ...write, kind: 'source-attribute' })),
]);

function drawing(envelope: SonicEnvelope): Array<Array<string | undefined>> {
	const parts = envelope.querySelectorAll<HTMLElement>(
		'.sonic-envelope-handle, .sonic-envelope-curve',
	);
	const paths = ['.sonic-envelope-line', '.sonic-envelope-fill:not(rect)'].map(
		(selector) => envelope.querySelector(selector)?.getAttribute('d') ?? undefined,
	);

	return [
		paths,
		...[...parts].map((part) => {
			if (part.hidden) return [part.dataset.sonicStage, 'hidden'];

			return [
				part.dataset.sonicStage,
				part.style.getPropertyValue('--_sonic-envelope-x'),
				part.style.getPropertyValue('--_sonic-envelope-y'),
				part.dataset.sonicAxes,
				part.dataset.sonicDisabled,
			];
		}),
	];
}

function freshDrawing(attributes: Element): Array<Array<string | undefined>> {
	const fresh = document.createElement('sonic-envelope');

	for (const { name, value } of attributes.attributes) fresh.setAttribute(name, value);
	document.body.append(fresh);

	const drawn = drawing(fresh);

	fresh.remove();

	return drawn;
}

function apply(host: SonicEnvelope, attributes: HTMLElement, write: Write): void {
	switch (write.kind) {
		case 'attribute': {
			didMirrorAttribute(host, attributes, write);
			break;
		}
		case 'source-attribute': {
			document.querySelector(`#${write.id}`)?.setAttribute(write.name, write.value);
			break;
		}
		case 'source-value': {
			const source = document.querySelector(`#${write.id}`);

			if (source && 'value' in source) source.value = write.value;
			break;
		}
	}
}

test.prop([steps], { numRuns: 150 })(
	'sonic-envelope: a connected envelope draws what a fresh one with its attributes would, whatever the order of binding, source writes and lifecycle',
	async (writes) => {
		vi.spyOn(console, 'warn').mockReturnValue();
		document.body.replaceChildren();
		for (const { attributes, id, tag } of sources) {
			const source = document.createElement(tag);

			source.id = id;
			for (const [name, value] of Object.entries(attributes)) source.setAttribute(name, value);
			document.body.append(source);
		}

		const host = document.createElement('sonic-envelope');
		const attributes = document.createElement('div');

		await runSteps(host, writes, {
			apply: (write) => {
				apply(host, attributes, write);
			},
			check: () => {
				if (host.isConnected) expect(drawing(host)).toStrictEqual(freshDrawing(attributes));
			},
		});
	},
);

plainTest(
	'sonic-envelope: a binding written while the envelope moves within one task survives the move, with no warning',
	() => {
		const warn = vi.spyOn(console, 'warn').mockReturnValue();
		document.body.innerHTML = '<sonic-slider id="time" max="10" value="4"></sonic-slider>';

		const host = document.createElement('sonic-envelope');

		document.body.append(host);
		host.remove();
		host.setAttribute('release', 'time');
		document.body.append(host);

		expect(drawing(host)).toStrictEqual(freshDrawing(host));
		expect(warn).not.toHaveBeenCalled();
	},
);
