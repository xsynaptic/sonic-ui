export const framesPerSecond = 44_100 / 1024;
export const minDecibels = -60;

const loopSeconds = 96;
// Puts the breakdown's start under the specimens' playhead at 150 seconds
const leadSeconds = 90;

function pulse(beats: number, decay: number): number {
	return Math.exp(-((beats % 1) * decay));
}

function isBreakdown(seconds: number): boolean {
	return seconds >= 48 && seconds < 64;
}

// `at` is where the voice sits between the lowest band and the highest
const voices = [
	{
		at: 0.04,
		level: (seconds: number) => (isBreakdown(seconds) ? 0 : 0.9 * pulse(seconds * 2, 7)),
	},
	{
		at: 0.2,
		level: (seconds: number) => (seconds < 16 ? 0 : 0.45 * (0.6 + 0.4 * pulse(seconds, 2))),
	},
	{
		at: 0.5,
		level: (seconds: number) =>
			(isBreakdown(seconds) ? 0.6 : 0.2) * (0.75 + 0.25 * Math.sin(seconds * 0.8)),
	},
	{
		at: 0.7,
		level: (seconds: number) => (seconds >= 32 && seconds < 80 ? 0.5 * pulse(seconds * 4, 3) : 0),
	},
	{
		at: 0.96,
		level: (seconds: number) => (seconds < 8 ? 0 : 0.35 * pulse(seconds * 2 + 0.5, 10)),
	},
];

function decibelByte(level: number): number {
	const decibels = 20 * Math.log10(Math.max(level, 1e-6));

	return Math.round(255 * Math.min(1, Math.max(0, 1 - decibels / minDecibels)));
}

function bandBytes(seconds: number, bandCount: number): Array<number> {
	const squares = Array.from({ length: bandCount }, () => 0);

	for (const voice of voices) {
		const band = Math.min(bandCount - 1, Math.floor(voice.at * bandCount));

		squares[band] = (squares[band] ?? 0) + voice.level(seconds) ** 2;
	}

	return squares.map((square) => decibelByte(Math.sqrt(square)));
}

export function fillLevels(
	levels: Uint8Array,
	bandCount: number,
	[fromFrame, toFrame]: [number, number],
): void {
	const frames = levels.length / bandCount;

	for (
		let bandFrame = Math.max(0, fromFrame);
		bandFrame < Math.min(frames, toFrame);
		bandFrame += 1
	) {
		const seconds = ((bandFrame + 0.5) / framesPerSecond + leadSeconds) % loopSeconds;

		levels.set(bandBytes(seconds, bandCount), bandFrame * bandCount);
	}
}

export function emptyLevels(seconds: number, bandCount: number): Uint8Array<ArrayBuffer> {
	return new Uint8Array(Math.ceil(seconds * framesPerSecond) * bandCount);
}
