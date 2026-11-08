import { fc } from '@fast-check/vitest';

export interface AttributeWrite {
	kind: 'attribute';
	name: string;
	value: string | undefined;
}

type Lifecycle = { kind: 'connect' } | { kind: 'disconnect' } | { kind: 'tick' };

export type Step<Write> = Lifecycle | { kind: 'write'; write: Write };

type Weighted<Write> = fc.Arbitrary<Write> | { arbitrary: fc.Arbitrary<Write>; weight: number };

export function attributeWrite(
	name: string,
	values: ReadonlyArray<string | undefined>,
): fc.Arbitrary<AttributeWrite> {
	return fc.constantFrom(...values).map((value) => ({ kind: 'attribute', name, value }));
}

export function stepsOf<Write>(
	writes: ReadonlyArray<Weighted<Write>>,
): fc.Arbitrary<Array<Step<Write>>> {
	const step = fc.oneof(
		{
			arbitrary: fc.constantFrom<Step<Write>>(
				{ kind: 'connect' },
				{ kind: 'disconnect' },
				{ kind: 'tick' },
			),
			weight: 9,
		},
		...writes.map((write) => {
			const { arbitrary, weight } = 'weight' in write ? write : { arbitrary: write, weight: 1 };

			return {
				arbitrary: arbitrary.map((own): Step<Write> => ({ kind: 'write', write: own })),
				weight,
			};
		}),
	);

	return fc.array(step, { maxLength: 16, size: 'medium' });
}

// Removing an attribute that isn't set fires no `attributeChangedCallback`, so it reports no write
export function didMirrorAttribute(
	host: Element,
	attributes: Element,
	{ name, value }: AttributeWrite,
): boolean {
	if (value === undefined && !attributes.hasAttribute(name)) return false;

	const elements = [host, attributes];

	if (value === undefined) for (const element of elements) element.removeAttribute(name);
	else for (const element of elements) element.setAttribute(name, value);

	return true;
}

interface Run<Write> {
	apply: (write: Write) => void;
	hasConnected: boolean;
	host: HTMLElement;
}

async function runStep<Write>(run: Run<Write>, step: Step<Write>): Promise<void> {
	switch (step.kind) {
		case 'connect': {
			document.body.append(run.host);
			run.hasConnected = true;
			return;
		}
		case 'disconnect': {
			run.host.remove();
			return;
		}
		case 'tick': {
			await Promise.resolve();
			return;
		}
		case 'write': {
			run.apply(step.write);
		}
	}
}

export async function runSteps<Write>(
	host: HTMLElement,
	steps: ReadonlyArray<Step<Write>>,
	{ apply, check }: { apply: Run<Write>['apply']; check: () => void },
): Promise<void> {
	const run: Run<Write> = { apply, hasConnected: false, host };

	for (const step of steps) {
		await runStep(run, step);
		if (run.hasConnected) check();
	}

	document.body.append(host);
	check();
}

export function numberAttribute(attributes: Element, name: string, fallback: number): number {
	const text = attributes.getAttribute(name)?.trim();
	const value = text ? Number(text) : NaN;

	return Number.isFinite(value) ? value : fallback;
}
