import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';

import type { PeaksRequest } from '#lib/peaks-request.ts';

import { createPeaksRequest } from '#lib/peaks-request.ts';

import { nextTask } from './helpers.ts';

const near: [number, number] = [79, 137];
const far: [number, number] = [120, 190];

function mountRequest(respond: (ask: number) => ReturnType<PeaksRequest>): {
	asked: Array<[number, number]>;
	frame: (wanted?: [number, number]) => void;
	peaks: ReturnType<typeof createPeaksRequest>;
	repaints: () => number;
} {
	const asked: Array<[number, number]> = [];
	let repaints = 0;

	const peaks = createPeaksRequest(() => {
		repaints += 1;
	});
	const request: PeaksRequest = (from, to) => {
		asked.push([from, to]);

		return respond(asked.length);
	};

	return {
		asked,
		frame: (wanted = near) => {
			peaks.ask(request, wanted);
		},
		peaks,
		repaints: () => repaints,
	};
}

function deferred(): { promise: Promise<void>; reject: () => void; resolve: () => void } {
	let settle: undefined | { reject: () => void; resolve: () => void };

	const promise = new Promise<void>((resolve, reject) => {
		settle = { reject, resolve };
	});

	return {
		promise,
		reject: () => {
			settle?.reject();
		},
		resolve: () => {
			settle?.resolve();
		},
	};
}

test('a window is asked for once, and again only when it moves or the request is replaced', () => {
	const { asked, frame, peaks, repaints } = mountRequest(() => []);

	frame();
	frame();
	expect(asked).toEqual([near]);

	frame(far);
	frame(far);
	expect(asked).toEqual([near, far]);

	peaks.reset();
	frame(far);
	expect(asked).toEqual([near, far, far]);
	expect(repaints()).toBe(1);
});

test('a promise repaints and asks again when it settles, either way', async () => {
	const settles = [deferred(), deferred(), deferred()];
	const { asked, frame, repaints } = mountRequest((ask) => settles[ask - 1]?.promise);

	frame();
	frame();
	expect([asked.length, repaints()]).toEqual([1, 0]);

	settles[0]?.resolve();
	await nextTask();
	frame();
	expect([asked.length, repaints()]).toEqual([2, 1]);

	settles[1]?.reject();
	await nextTask();
	frame();
	expect([asked.length, repaints()]).toEqual([3, 2]);
});

test('a request still out when a later window is asked for repaints as it settles', async () => {
	const first = deferred();
	const { asked, frame, repaints } = mountRequest((ask) => (ask === 1 ? first.promise : undefined));

	frame(near);
	frame(far);
	first.resolve();
	await nextTask();
	frame(far);

	expect(asked).toEqual([near, far, far]);
	expect(repaints()).toBe(1);
});

test('a write from inside the call repaints without asking again; one from outside asks again', () => {
	const harness = mountRequest(() => {
		harness.peaks.changed();

		return;
	});
	const { asked, frame, peaks, repaints } = harness;

	frame();
	frame();
	expect([asked.length, repaints()]).toEqual([1, 1]);

	peaks.changed();
	frame();
	expect([asked.length, repaints()]).toEqual([2, 3]);
});

test('a request that throws is not left counting later writes as its own', () => {
	const { asked, frame, peaks } = mountRequest((ask) => {
		if (ask === 1) throw new Error('The consumer threw');

		return;
	});

	expect(() => {
		frame();
	}).toThrow('The consumer threw');
	peaks.changed();
	frame();

	expect(asked).toHaveLength(2);
});

test('one settled promise returned on every call is asked twice, not every frame', async () => {
	const loaded = Promise.resolve();
	const { asked, frame } = mountRequest(() => loaded);

	for (let index = 0; index < 4; index += 1) {
		frame();
		await nextTask();
	}

	expect(asked).toHaveLength(2);
});

test('two promises returned together each repaint as they settle', async () => {
	const chunks = [deferred(), deferred()];
	const { asked, frame, repaints } = mountRequest(() => chunks.map(({ promise }) => promise));

	frame();
	for (const [index, chunk] of chunks.entries()) {
		chunk.resolve();
		await nextTask();
		frame();
		frame();
		expect([asked.length, repaints()]).toEqual([index + 2, index + 1]);
	}
});

type Response = 'again' | 'inside' | 'none' | 'one' | 'throw' | 'two';

type Window = [number, number];

type Step =
	| { kind: 'ask'; response: Response; wanted: undefined | Window }
	| { kind: 'changed' | 'reset' }
	| { kind: 'settle'; pick: number };

interface Expected {
	asks: number;
	lastAsked: undefined | Window;
	repaints: number;
}

// Windows that print alike when joined without a separator: 0.1 to 23, 0.12 to 3
const window = fc.tuple(fc.constantFrom(0.1, 0.12, 1.2), fc.constantFrom(2.3, 3, 23));
const step = fc.oneof(
	{
		arbitrary: fc.record(
			{
				kind: fc.constant('ask' as const),
				response: fc.constantFrom<Response>('again', 'inside', 'none', 'one', 'throw', 'two'),
				wanted: fc.option(window, { freq: 8, nil: undefined }),
			},
			{ noNullPrototype: true },
		),
		weight: 6,
	},
	fc.record(
		{ kind: fc.constantFrom('changed' as const, 'reset' as const) },
		{ noNullPrototype: true },
	),
	{
		arbitrary: fc.record(
			{ kind: fc.constant('settle' as const), pick: fc.nat() },
			{ noNullPrototype: true },
		),
		weight: 2,
	},
);

function mountScenario(): {
	ask: (response: Response, wanted: undefined | Window) => void;
	asked: Array<Window>;
	peaks: ReturnType<typeof createPeaksRequest>;
	repaints: () => number;
	settle: (pick: number) => Promise<boolean>;
} {
	const asked: Array<Window> = [];
	const pending: Array<ReturnType<typeof deferred>> = [];
	const returned: Array<Promise<void>> = [];
	let response: Response = 'none';
	let repaints = 0;

	const peaks = createPeaksRequest(() => {
		repaints += 1;
	});
	const fresh = (): Promise<void> => {
		const next = deferred();

		pending.push(next);
		returned.push(next.promise);

		return next.promise;
	};
	const replies: Record<Response, () => ReturnType<PeaksRequest>> = {
		again: () => returned.at(-1),
		inside: () => {
			peaks.changed();

			return [];
		},
		none: () => [],
		one: fresh,
		throw: () => {
			throw new Error('The consumer threw');
		},
		two: () => [fresh(), fresh()],
	};
	const request: PeaksRequest = (from, to) => {
		asked.push([from, to]);

		return replies[response]();
	};

	return {
		ask: (reply, wanted) => {
			response = reply;
			try {
				peaks.ask(request, wanted);
			} catch (error) {
				if (reply !== 'throw') throw error;
			}
		},
		asked,
		peaks,
		repaints: () => repaints,
		settle: async (pick) => {
			const settling = pending.splice(pick % Math.max(1, pending.length), 1)[0];
			if (!settling) return false;

			if (pick % 2 === 0) settling.resolve();
			else settling.reject();
			await nextTask();

			return true;
		},
	};
}

function afterAsk(
	expected: Expected,
	{ response, wanted }: { response: Response; wanted: undefined | Window },
): Expected {
	const [from, to] = expected.lastAsked ?? [];
	if (!wanted || (wanted[0] === from && wanted[1] === to)) return expected;

	return {
		asks: expected.asks + 1,
		lastAsked: wanted,
		repaints: expected.repaints + (response === 'inside' ? 1 : 0),
	};
}

function afterWrite(expected: Expected): Expected {
	return { ...expected, lastAsked: undefined, repaints: expected.repaints + 1 };
}

test.prop([fc.array(step, { maxLength: 30, minLength: 1 })], { numRuns: 300 })(
	'a window is asked for again only after a write from outside the call, a reset or the settling of a promise not seen before',
	async (steps: Array<Step>) => {
		const scenario = mountScenario();
		let expected: Expected = { asks: 0, lastAsked: undefined, repaints: 0 };

		for (const next of steps) {
			if (next.kind === 'ask') {
				scenario.ask(next.response, next.wanted);
				expected = afterAsk(expected, next);
			} else if (next.kind === 'settle') {
				if (await scenario.settle(next.pick)) expected = afterWrite(expected);
			} else {
				scenario.peaks[next.kind]();
				expected = afterWrite(expected);
			}

			expect([scenario.asked.length, scenario.repaints()]).toEqual([
				expected.asks,
				expected.repaints,
			]);
		}
	},
);
