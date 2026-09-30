const noteBySixteenth = new Map([
	[0, 69],
	[3, 72],
	[6, 76],
	[10, 74],
	[16, 69],
	[19, 67],
	[22, 64],
	[28, 62],
]);
const sixteenthsPerPhrase = 32;
const lookahead = 0.12;
const decay = 0.35;

function frequencyOf(note: number): number {
	return 440 * 2 ** ((note - 69) / 12);
}

function pluck(destination: AudioNode, note: number, time: number): void {
	const { context } = destination;
	const oscillator = new OscillatorNode(context, {
		frequency: frequencyOf(note),
		type: 'sawtooth',
	});
	const filter = new BiquadFilterNode(context, { Q: 4, type: 'lowpass' });
	const envelope = new GainNode(context, { gain: 0 });

	filter.frequency.setValueAtTime(3200, time);
	filter.frequency.exponentialRampToValueAtTime(300, time + decay);
	envelope.gain.setValueAtTime(0, time);
	envelope.gain.linearRampToValueAtTime(0.2, time + 0.004);
	envelope.gain.exponentialRampToValueAtTime(0.0001, time + decay);
	oscillator.connect(filter).connect(envelope).connect(destination);
	oscillator.start(time);
	oscillator.stop(time + decay + 0.05);
}

export function createPlucks(context: AudioContext, destination: AudioNode) {
	const beats: Array<number> = [];
	let step = 0;
	let nextTime = 0;

	function restart(): void {
		step = 0;
		nextTime = context.currentTime + 0.02;
		beats.length = 0;
	}

	function schedule(beatSeconds: number): void {
		const stepSeconds = beatSeconds / 4;

		while (nextTime < context.currentTime + lookahead) {
			const note = noteBySixteenth.get(step);

			if (note !== undefined) pluck(destination, note, nextTime);
			if (step % 4 === 0) beats.push(nextTime);
			step = (step + 1) % sixteenthsPerPhrase;
			nextTime += stepSeconds;
		}
	}

	function isOnBeat(beatSeconds: number): boolean {
		const now = context.currentTime;

		while (beats.length > 1 && (beats[1] ?? Infinity) <= now) beats.shift();

		const beat = beats[0];

		return beat !== undefined && beat <= now && now - beat < beatSeconds / 2;
	}

	return { isOnBeat, restart, schedule };
}
