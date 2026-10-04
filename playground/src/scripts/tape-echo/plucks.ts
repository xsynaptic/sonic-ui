const noteBySixteenth = new Map([
	[0, 57],
	[3, 64],
	[6, 60],
	[10, 62],
	[16, 57],
	[19, 55],
	[22, 60],
	[28, 52],
]);
const sixteenthsPerPhrase = 32;
const lookahead = 0.12;
const decay = 0.6;

function frequencyOf(note: number): number {
	return 440 * 2 ** ((note - 69) / 12);
}

function pluck(destination: AudioNode, note: number, time: number): void {
	const { context } = destination;
	const frequency = frequencyOf(note);
	const body = new OscillatorNode(context, { frequency, type: 'triangle' });
	const edge = new OscillatorNode(context, { detune: 7, frequency, type: 'sawtooth' });
	const edgeLevel = new GainNode(context, { gain: 0.25 });
	const filter = new BiquadFilterNode(context, { Q: 1, type: 'lowpass' });
	const envelope = new GainNode(context, { gain: 0 });

	filter.frequency.setValueAtTime(2400, time);
	filter.frequency.exponentialRampToValueAtTime(400, time + decay);
	envelope.gain.setValueAtTime(0, time);
	envelope.gain.linearRampToValueAtTime(0.3, time + 0.008);
	envelope.gain.exponentialRampToValueAtTime(0.0001, time + decay);
	body.connect(filter);
	edge.connect(edgeLevel).connect(filter);
	filter.connect(envelope).connect(destination);
	for (const oscillator of [body, edge]) {
		oscillator.start(time);
		oscillator.stop(time + decay + 0.05);
	}
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
