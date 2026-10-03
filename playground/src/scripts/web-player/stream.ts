import type { SonicWaveform } from '@xsynaptic/sonic-ui';

import { emptySamples, fillSamples, pairsPerSecond } from '#scripts/seeded-dat.ts';
import { seededPeaks } from '#scripts/seeded-peaks.ts';

interface Cue extends Marker {
	label: string;
}

type Marker = SonicWaveform['markers'][number];

export interface Track {
	artist: string;
	cues?: Array<Cue>;
	durationSeconds: number;
	peaks: Array<number>;
	title: string;
}

export interface StreamState {
	buffered: Array<[number, number]>;
	canNext: boolean;
	canPrevious: boolean;
	isLoaded: boolean;
	isPlaying: boolean;
	isWaiting: boolean;
	pending: Array<[number, number]>;
	positionSeconds: number;
	samples: Int8Array<ArrayBuffer>;
	track: Track;
}

interface Player {
	buffered: Array<[number, number]>;
	chunks: Map<number, number>;
	index: number;
	isLoaded: boolean;
	isPlaying: boolean;
	latencySeconds: number;
	positionSeconds: number;
	samples: Int8Array<ArrayBuffer>;
	tracks: ReadonlyArray<Track>;
}

export const tracks: Array<Track> = [
	{ artist: 'An artist', durationSeconds: 252, peaks: seededPeaks(11), title: 'First track' },
	{ artist: 'Another artist', durationSeconds: 178, peaks: seededPeaks(12), title: 'Second track' },
	{
		artist: 'A third artist',
		cues: [
			{ end: 38, kind: 'intro', label: 'Intro', value: 0 },
			{ label: 'Low light', value: 38 },
			{ label: 'Undertow', value: 112 },
			{ label: 'Glass harbour', value: 196 },
			{ label: 'Late signal', value: 271 },
			{ dimmed: true, label: 'Unlisted', value: 344 },
		],
		durationSeconds: 390,
		peaks: seededPeaks(13),
		title: 'Short mix',
	},
];

const restartSeconds = 3;

const chunkSeconds = 10;
const fillSecondsPerSecond = 4;
const readAheadSeconds = 30;
const requestLatencySeconds = 0.8;
const startBufferSeconds = 2;

function trackOf(player: Player): Track {
	const track = player.tracks[player.index];
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

function seek(player: Player, seconds: number): void {
	player.positionSeconds = Math.min(Math.max(seconds, 0), trackOf(player).durationSeconds);
	if (rangeAt(player)) return;

	player.buffered = merge([...player.buffered, [player.positionSeconds, player.positionSeconds]]);
	player.latencySeconds = requestLatencySeconds;
}

function load(player: Player, index: number): void {
	if (index < 0 || index >= player.tracks.length) return;

	player.index = index;
	player.isLoaded = true;
	player.buffered = [];
	player.chunks = new Map();
	player.samples = emptySamples(trackOf(player).durationSeconds);
	seek(player, 0);
}

function readAheadOf(player: Player): number {
	return Math.min(player.positionSeconds + readAheadSeconds, trackOf(player).durationSeconds);
}

function fill(player: Player, elapsedSeconds: number): void {
	if (!player.isLoaded) return;
	if (player.latencySeconds > 0) {
		player.latencySeconds = Math.max(0, player.latencySeconds - elapsedSeconds);
		return;
	}

	const range = rangeAt(player);
	const target = readAheadOf(player);
	if (!range || range[1] >= target) return;

	range[1] = Math.min(range[1] + fillSecondsPerSecond * elapsedSeconds, target);
	player.buffered = merge(player.buffered);
}

function isFilling(player: Player): boolean {
	if (!player.isLoaded) return false;
	if (player.latencySeconds > 0) return true;

	const range = rangeAt(player);

	return range !== undefined && range[1] < readAheadOf(player);
}

function isWaiting(player: Player): boolean {
	const ahead = (rangeAt(player)?.[1] ?? player.positionSeconds) - player.positionSeconds;
	const left = trackOf(player).durationSeconds - player.positionSeconds;

	return (
		player.isPlaying && (player.latencySeconds > 0 || ahead < Math.min(startBufferSeconds, left))
	);
}

function advance(player: Player, elapsedSeconds: number): void {
	if (!player.isPlaying || isWaiting(player)) return;

	player.positionSeconds += elapsedSeconds;
	if (player.positionSeconds < trackOf(player).durationSeconds) return;
	if (player.index < player.tracks.length - 1) {
		load(player, player.index + 1);
		return;
	}

	player.positionSeconds = trackOf(player).durationSeconds;
	player.isPlaying = false;
}

function wantSamples(player: Player, fromSeconds: number, toSeconds: number): void {
	if (!player.isLoaded) return;

	const last = Math.ceil(trackOf(player).durationSeconds / chunkSeconds) - 1;

	for (
		let chunk = Math.max(0, Math.floor(fromSeconds / chunkSeconds));
		chunk <= Math.min(last, Math.floor(toSeconds / chunkSeconds));
		chunk += 1
	) {
		if (!player.chunks.has(chunk)) player.chunks.set(chunk, requestLatencySeconds);
	}
}

function hasLandedSamples(player: Player, elapsedSeconds: number): boolean {
	let hasLanded = false;

	for (const [chunk, waitSeconds] of player.chunks) {
		if (waitSeconds === 0) continue;

		const left = Math.max(0, waitSeconds - elapsedSeconds);

		player.chunks.set(chunk, left);
		if (left > 0) continue;

		fillSamples(player.samples, trackOf(player).peaks, [
			Math.floor(chunk * chunkSeconds * pairsPerSecond),
			Math.ceil((chunk + 1) * chunkSeconds * pairsPerSecond),
		]);
		hasLanded = true;
	}

	return hasLanded;
}

function pendingOf(player: Player): Array<[number, number]> {
	return [...player.chunks]
		.filter(([, waitSeconds]) => waitSeconds > 0)
		.map(([chunk]) => [chunk * chunkSeconds, (chunk + 1) * chunkSeconds]);
}

function stateOf(player: Player): StreamState {
	const { index, isLoaded, positionSeconds } = player;

	return {
		buffered: player.buffered.map(([start, end]) => [start, end]),
		canNext: isLoaded && index < player.tracks.length - 1,
		canPrevious: isLoaded && (index > 0 || positionSeconds > restartSeconds),
		isLoaded,
		isPlaying: player.isPlaying,
		isWaiting: isWaiting(player),
		pending: pendingOf(player),
		positionSeconds,
		samples: player.samples,
		track: trackOf(player),
	};
}

export function createStream(tracks: ReadonlyArray<Track>) {
	const player: Player = {
		buffered: [],
		chunks: new Map(),
		index: 0,
		isLoaded: false,
		isPlaying: false,
		latencySeconds: 0,
		positionSeconds: 0,
		samples: new Int8Array(0),
		tracks,
	};

	return {
		next(): void {
			load(player, player.index + 1);
		},
		pause(): void {
			player.isPlaying = false;
		},
		play(): void {
			player.isPlaying = true;
			if (!player.isLoaded) load(player, player.index);
			if (player.positionSeconds >= trackOf(player).durationSeconds) seek(player, 0);
		},
		previous(): void {
			if (player.positionSeconds <= restartSeconds) {
				load(player, player.index - 1);
				return;
			}

			seek(player, 0);
		},
		seek(seconds: number): void {
			seek(player, seconds);
		},
		get state(): StreamState {
			return stateOf(player);
		},
		tick(elapsedSeconds: number): { hasLanded: boolean; isActive: boolean } {
			fill(player, elapsedSeconds);
			advance(player, elapsedSeconds);

			const hasLanded = hasLandedSamples(player, elapsedSeconds);
			const isActive = player.isPlaying || isFilling(player) || pendingOf(player).length > 0;

			return { hasLanded, isActive };
		},
		wantSamples(fromSeconds: number, toSeconds: number): void {
			wantSamples(player, fromSeconds, toSeconds);
		},
	};
}
