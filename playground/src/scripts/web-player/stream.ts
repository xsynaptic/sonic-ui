interface Track {
	artist: string;
	durationSeconds: number;
	title: string;
}

export interface Player {
	buffered: Array<[number, number]>;
	index: number;
	isLoaded: boolean;
	isPlaying: boolean;
	latencySeconds: number;
	positionSeconds: number;
}

export const tracks: Array<Track> = [
	{ artist: 'An artist', durationSeconds: 252, title: 'First track' },
	{ artist: 'Another artist', durationSeconds: 178, title: 'Second track' },
	{ artist: 'A third artist', durationSeconds: 390, title: 'Third track' },
];

export const restartSeconds = 3;

const fillSecondsPerSecond = 4;
const readAheadSeconds = 30;
const requestLatencySeconds = 0.8;
const startBufferSeconds = 2;

export function trackOf(player: Player): Track {
	const track = tracks[player.index];
	if (!track) throw new Error(`The queue has no track ${String(player.index)}`);

	return track;
}

function rangeAt(player: Player): [number, number] | undefined {
	const position = player.positionSeconds;

	return player.buffered.find(([start, end]) => start <= position && position <= end);
}

function merge(ranges: Array<[number, number]>): Array<[number, number]> {
	const merged: Array<[number, number]> = [];
	const sorted = ranges.toSorted((first, second) => first[0] - second[0]);

	for (const [start, end] of sorted) {
		const last = merged.at(-1);

		if (last && start <= last[1]) last[1] = Math.max(last[1], end);
		else merged.push([start, end]);
	}

	return merged;
}

export function seek(player: Player, seconds: number): void {
	player.positionSeconds = Math.min(Math.max(seconds, 0), trackOf(player).durationSeconds);
	if (rangeAt(player)) return;

	player.buffered = merge([...player.buffered, [player.positionSeconds, player.positionSeconds]]);
	player.latencySeconds = requestLatencySeconds;
}

export function load(player: Player, index: number): void {
	if (index < 0 || index >= tracks.length) return;

	player.index = index;
	player.isLoaded = true;
	player.buffered = [];
	seek(player, 0);
}

export function fill(player: Player, elapsedSeconds: number): void {
	if (!player.isLoaded) return;
	if (player.latencySeconds > 0) {
		player.latencySeconds = Math.max(0, player.latencySeconds - elapsedSeconds);
		return;
	}

	const range = rangeAt(player);
	const target = Math.min(
		player.positionSeconds + readAheadSeconds,
		trackOf(player).durationSeconds,
	);
	if (!range || range[1] >= target) return;

	range[1] = Math.min(range[1] + fillSecondsPerSecond * elapsedSeconds, target);
	player.buffered = merge(player.buffered);
}

export function isWaiting(player: Player): boolean {
	const ahead = (rangeAt(player)?.[1] ?? player.positionSeconds) - player.positionSeconds;
	const left = trackOf(player).durationSeconds - player.positionSeconds;

	return (
		player.isPlaying && (player.latencySeconds > 0 || ahead < Math.min(startBufferSeconds, left))
	);
}

export function advance(player: Player, elapsedSeconds: number): void {
	if (!player.isPlaying || isWaiting(player)) return;

	player.positionSeconds += elapsedSeconds;
	if (player.positionSeconds < trackOf(player).durationSeconds) return;
	if (player.index < tracks.length - 1) {
		load(player, player.index + 1);
		return;
	}

	player.positionSeconds = trackOf(player).durationSeconds;
	player.isPlaying = false;
}
