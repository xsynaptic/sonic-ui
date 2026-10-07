import { expect, test } from 'vitest';

import type { ValueSpec } from '#lib/value-mapping.ts';
import type { ValueModel } from '#lib/value-model.ts';

import { createValueModel } from '#lib/value-model.ts';

function modelFrom(start: number): { model: ValueModel; spec: ValueSpec } {
	const spec: ValueSpec = {
		isNotched: false,
		isWrapping: false,
		max: 110,
		min: 10,
		step: 5,
		taper: 'linear',
	};
	const model = createValueModel(() => spec);

	model.respec(start);

	return { model, spec };
}

test('a host write keeps its raw ask through a narrowed range, a wider one and a finer step', () => {
	const { model, spec } = modelFrom(40);
	const values: Array<number> = [];

	expect(model.write(83)).toBe(true);
	values.push(model.value);
	for (const change of [{ max: 40 }, { max: 110 }, { step: 2 }]) {
		Object.assign(spec, change);
		model.respec(40);
		values.push(model.value);
	}

	expect(values).toEqual([85, 40, 85, 84]);
});

test('a gesture write asks for the snapped value, so a finer step resnaps from there', () => {
	const { model, spec } = modelFrom(40);

	expect(model.input(83)).toBe(true);
	spec.step = 2;
	model.respec(40);

	expect(model.value).toBe(86);
});

test('a write that snaps back to the value reports no move, and one that is not finite keeps the ask', () => {
	const { model, spec } = modelFrom(40);

	model.write(83);

	expect([model.write(86), model.input(84), model.write(83)]).toEqual([false, false, false]);
	expect([model.input(NaN), model.write(Infinity)]).toEqual([false, false]);

	spec.step = 2;
	model.respec(40);
	expect(model.value).toBe(84);
});

test('a limit holds a gesture write inside it and leaves a host write alone, until it is cleared', () => {
	const { model } = modelFrom(40);
	const values: Array<number> = [];

	model.setLimit([20, 65]);
	for (const next of [1000, -1000]) {
		model.input(next);
		values.push(model.value);
	}
	model.write(100);
	values.push(model.value);
	expect(model.limit()).toEqual([20, 65]);

	model.setLimit(undefined);
	model.input(1000);
	values.push(model.value);

	expect(values).toEqual([65, 20, 100, 110]);
});

test('a landing resolves where a commit lands, and a target lands as asked without one', () => {
	const { model } = modelFrom(40);
	const landed = [model.land(30, 1)];

	model.setLanding((target, direction) => target + direction * 5);
	landed.push(model.land(30, -1));
	model.setLanding(undefined);
	landed.push(model.land(30, -1));

	expect(landed).toEqual([30, 25, 30]);
});

test('a respec resnaps from the ask, and from the fallback once the ask is forgotten', () => {
	const { model } = modelFrom(40);
	const values: Array<number> = [];

	model.write(83);
	model.respec(30);
	values.push(model.value);
	model.respec(30, { forgetAsk: true });
	values.push(model.value);
	model.respec(52);
	values.push(model.value);

	expect(values).toEqual([85, 30, 50]);
});

test('the mapping is kept until a respec', () => {
	const { model, spec } = modelFrom(40);

	model.mapping();
	spec.max = 40;
	expect(model.mapping().bounds).toEqual([10, 110]);

	model.respec(40);
	expect(model.mapping().bounds).toEqual([10, 40]);
});

test('a watcher hears a notification and no write, until it lets go', () => {
	const { model } = modelFrom(40);
	let heard = 0;
	const unwatch = model.watch(() => {
		heard += 1;
	});

	model.input(60);
	model.write(70);
	model.respec(40);
	expect(heard).toBe(0);

	model.notify();
	unwatch();
	model.notify();
	expect(heard).toBe(1);
});
