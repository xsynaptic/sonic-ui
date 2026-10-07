import { expect, test } from 'vitest';

import { scrubRegions } from '#lib/scrub.ts';

import { mappingOf } from './helpers.ts';

const mapping = mappingOf({ max: 110, min: 10, step: 5 });

test('a revealed hold that has moved off playback draws from where playback is to where it reached', () => {
	expect(scrubRegions({ from: 40, isRevealed: true, played: 60 }, 85, mapping)).toEqual({
		played: 0.5,
		scrub: 0.75,
	});
});

test.each([
	['is not revealed yet', { from: 40, isRevealed: false, played: 60 }, 85],
	['sits where playback is', { from: 40, isRevealed: true, played: 60 }, 60],
	['is a reveal with nothing held', { from: undefined, isRevealed: true, played: 60 }, 85],
])('a hold that %s has no scrub region', (_case, state, value) => {
	expect(scrubRegions(state, value, mapping)).toEqual({ played: 0.5, scrub: undefined });
});
