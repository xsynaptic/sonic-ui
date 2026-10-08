import { expect, test, vi } from 'vitest';

import type { Close } from '#scripts/tape-echo/sources.ts';

import { createSourceSwitch } from '#scripts/tape-echo/sources.ts';

function deferred() {
	const close = vi.fn<Close>();
	const { promise, reject, resolve } = Promise.withResolvers<Close>();

	return {
		close,
		open: () => promise,
		reject,
		resolve: () => {
			resolve(close);
		},
	};
}

test('a source that opens after the choice has moved on is closed at once', async () => {
	const mic = deferred();
	const phrase = deferred();
	const select = createSourceSwitch({ mic: mic.open, phrase: phrase.open });

	const first = select('mic');
	const second = select('phrase');

	phrase.resolve();
	mic.resolve();
	await Promise.all([first, second]);

	expect(mic.close).toHaveBeenCalledOnce();
	expect(phrase.close).not.toHaveBeenCalled();

	await select();

	expect(phrase.close).toHaveBeenCalledOnce();
	expect(mic.close).toHaveBeenCalledOnce();
});

test('a source that opens after the stop is closed, and nothing is left open', async () => {
	const mic = deferred();
	const select = createSourceSwitch({ mic: mic.open });

	const opening = select('mic');
	const stopping = select();

	mic.resolve();
	await Promise.all([opening, stopping]);

	expect(mic.close).toHaveBeenCalledOnce();

	await select();

	expect(mic.close).toHaveBeenCalledOnce();
});

test('a refusal reaches the caller only while its source is still the choice', async () => {
	const mic = deferred();
	const late = deferred();
	const phrase = deferred();
	const select = createSourceSwitch({ late: late.open, mic: mic.open, phrase: phrase.open });

	const refused = select('mic');

	mic.reject(new Error('refused'));
	await expect(refused).rejects.toThrow('refused');

	const stale = select('late');
	const current = select('phrase');

	phrase.resolve();
	late.reject(new Error('refused late'));

	await expect(stale).resolves.toBeUndefined();
	await current;
	expect(phrase.close).not.toHaveBeenCalled();
});
