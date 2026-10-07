import { expect, test } from 'vitest';

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
