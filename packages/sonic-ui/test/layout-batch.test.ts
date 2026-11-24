import { expect, test } from 'vitest';

import { queueLayout } from '#lib/layout-batch.ts';

function recordPass(log: Array<string>, name: string) {
	return () => ({
		measure: () => {
			log.push(`${name} measure`);

			return () => {
				log.push(`${name} write`);
			};
		},
		prepare: () => {
			log.push(`${name} prepare`);
		},
	});
}

test('every pass queued in a task prepares, then measures, before any writes, and a requeue replaces its plan', async () => {
	const log: Array<string> = [];
	const first = {};
	const second = {};

	queueLayout(first, recordPass(log, 'stale'));
	queueLayout(second, recordPass(log, 'second'));
	queueLayout(first, recordPass(log, 'first'));
	expect(log).toEqual([]);

	await Promise.resolve();

	expect(log).toEqual([
		'first prepare',
		'second prepare',
		'first measure',
		'second measure',
		'first write',
		'second write',
	]);
});
