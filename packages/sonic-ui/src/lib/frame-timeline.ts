import type { SurfaceSize } from '#lib/canvas-surface.ts';

import { trimFloat } from '#lib/math.ts';

export interface View {
	dpr: number;
	height: number;
	pending: Array<[number, number]>;
	phase: number;
	pixelsPerSecond: number;
	startSeconds: number;
	width: number;
}

export interface Drawn {
	seconds: number;
	startSeconds: number;
}

interface TimelineInput {
	clockSeconds: number;
	frameMs: number;
	held?: { grabbed: Drawn; seconds: number };
	isPaged: boolean;
	isPlaying: boolean;
	pending: ReadonlyArray<[number, number]>;
	range: [number, number];
	size: SurfaceSize;
	zoom: number;
}

interface Timeline {
	ghostAt?: number;
	isMoving: boolean;
	paintKey: string;
	playheadAt: number;
	seconds: number;
	view: View;
	wanted?: [number, number];
}

const placeholderPeriodMs = 2500;

const lookAheadSeconds = 30;

function windowStart(input: TimelineInput, seconds: number, windowSeconds: number): number {
	if (!input.isPaged) return seconds - windowSeconds / 2;
	if (input.held) return input.held.grabbed.startSeconds + seconds - input.held.grabbed.seconds;

	// 0.3 / 0.1 is 2.9999999999999996, a page short
	return Math.floor(trimFloat(seconds / windowSeconds)) * windowSeconds;
}

function overlap(
	[from, to]: readonly [number, number],
	[low, high]: readonly [number, number],
): [number, number] | undefined {
	const start = Math.max(from, low);
	const end = Math.min(to, high);

	return end > start ? [start, end] : undefined;
}

function pendingIn(
	{ pending, range }: TimelineInput,
	window: [number, number],
): Array<[number, number]> {
	return pending.flatMap((region) => {
		const inRange = overlap(region, range);
		const shown = inRange && overlap(inRange, window);

		return shown ? [shown] : [];
	});
}

function placeholderPhase(
	{ frameMs, isPaged }: TimelineInput,
	pending: ReadonlyArray<unknown>,
): number | undefined {
	return !isPaged && pending.length > 0 ? frameMs / placeholderPeriodMs : undefined;
}

export function frameTimeline(input: TimelineInput): Timeline {
	const { clockSeconds, held, range, size } = input;
	const seconds = held?.seconds ?? clockSeconds;
	const pixelsPerSecond = input.zoom * size.dpr;
	const windowSeconds = size.width / pixelsPerSecond;
	const startSeconds = windowStart(input, seconds, windowSeconds);
	const pending = pendingIn(input, [startSeconds, startSeconds + windowSeconds]);
	const placeholder = placeholderPhase(input, pending);
	const phase = placeholder ?? 0;
	const wanted = overlap(
		[
			startSeconds - windowSeconds,
			startSeconds + windowSeconds + Math.max(windowSeconds, lookAheadSeconds),
		],
		range,
	);
	const at = (time: number): number => (time - startSeconds) / windowSeconds;

	return {
		...(held ? { ghostAt: at(clockSeconds) } : {}),
		isMoving: held !== undefined || placeholder !== undefined || input.isPlaying,
		paintKey: [startSeconds, windowSeconds, ...range, phase, pending.join(',')].join(':'),
		playheadAt: at(seconds),
		seconds,
		view: {
			dpr: size.dpr,
			height: size.height,
			pending,
			phase,
			pixelsPerSecond,
			startSeconds,
			width: size.width,
		},
		...(wanted ? { wanted } : {}),
	};
}
