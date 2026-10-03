// Mulberry32, so every load draws the same mix and the playground ships no binary
function random(seed: number): () => number {
	let state = seed;

	return () => {
		state = (state + 0x6d_2b_79_f5) >>> 0;

		let mixed = Math.imul(state ^ (state >>> 15), 1 | state);

		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);

		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
	};
}

export function seededPeaks(seed: number, count = 400): Array<number> {
	const next = random(seed);
	const fadeBars = count / 30;
	const peaks: Array<number> = [];
	let level = 0.7;

	for (let index = 0; index < count; index += 1) {
		if (index % 8 === 0 && next() < 0.25) level = 0.35 + next() * 0.65;

		const fade = Math.min(1, index / fadeBars, (count - 1 - index) / fadeBars);

		peaks.push(fade * level * (0.7 + next() * 0.3));
	}

	return peaks;
}
