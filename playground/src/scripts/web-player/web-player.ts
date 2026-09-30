import type { SonicDial, SonicKey, SonicSlider } from '@xsynaptic/sonic-ui';

import { formatPercent, parsePercent } from '@xsynaptic/sonic-ui';

import type { Player } from '#scripts/web-player/stream.ts';

import { find } from '#scripts/find.ts';
import {
	advance,
	fill,
	isFilling,
	isWaiting,
	load,
	restartSeconds,
	seek,
	trackOf,
	tracks,
} from '#scripts/web-player/stream.ts';

interface Bar {
	artist: HTMLElement;
	clock: HTMLElement;
	next: SonicKey;
	panelToggle: SonicKey;
	play: SonicKey;
	previous: SonicKey;
	seekKeys: Array<SonicKey>;
	strip: SonicSlider;
	time: SonicKey;
	title: HTMLElement;
	zoomKeys: Array<SonicKey>;
}

const zoomLevels = 5;

function formatClock(seconds: number): string {
	const total = Math.floor(Math.abs(seconds));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor(total / 60) % 60;
	const rest = String(total % 60).padStart(2, '0');
	const sign = seconds < 0 ? '−' : '';

	if (hours === 0) return `${sign}${String(minutes)}:${rest}`;

	return `${sign}${String(hours)}:${String(minutes).padStart(2, '0')}:${rest}`;
}

function readBar(root: Element): Bar {
	return {
		artist: find(root, ':scope [data-artist]'),
		clock: find(root, ':scope [data-time] > .sonic-screen'),
		next: find(root, ':scope [data-next]'),
		panelToggle: find(root, ':scope [data-panel-toggle]'),
		play: find(root, ':scope [data-play]'),
		previous: find(root, ':scope [data-previous]'),
		seekKeys: [...root.querySelectorAll<SonicKey>(':scope [data-seek-by]')],
		strip: find(root, ':scope [data-seek]'),
		time: find(root, ':scope [data-time]'),
		title: find(root, ':scope [data-title]'),
		zoomKeys: [...root.querySelectorAll<SonicKey>(':scope [data-zoom]')],
	};
}

// The key copies its children again on every text change
function writeText(element: HTMLElement, text: string): void {
	if (element.textContent !== text) element.textContent = text;
}

function renderText(player: Player, bar: Bar): void {
	const track = trackOf(player);
	const { positionSeconds } = player;
	const shown = bar.time.pressed ? positionSeconds - track.durationSeconds : positionSeconds;

	writeText(bar.title, track.title);
	writeText(bar.artist, track.artist);
	writeText(bar.clock, player.isLoaded ? formatClock(shown) : '--:--');
}

function renderAvailability(player: Player, bar: Bar, zoom: number): void {
	const { index, isLoaded } = player;

	bar.play.toggleAttribute('busy', isWaiting(player));
	bar.previous.toggleAttribute(
		'soft-disabled',
		!isLoaded || (index === 0 && player.positionSeconds <= restartSeconds),
	);
	bar.next.toggleAttribute('soft-disabled', !isLoaded || index === tracks.length - 1);
	for (const control of [...bar.seekKeys, bar.strip, bar.time, bar.panelToggle]) {
		control.toggleAttribute('disabled', !isLoaded);
	}
	for (const key of bar.zoomKeys) {
		const next = zoom + Number(key.dataset.zoom);

		key.toggleAttribute('soft-disabled', next < 0 || next >= zoomLevels);
	}
}

function renderStrip(player: Player, strip: SonicSlider): void {
	const { durationSeconds } = trackOf(player);

	if (strip.max !== durationSeconds) strip.max = durationSeconds;
	strip.value = player.positionSeconds;
	strip.buffered = player.buffered;
}

function bindControls(root: Element, player: Player, bar: Bar): void {
	const panel = find<HTMLElement>(root, ':scope [data-panel]');
	const mute = find<SonicKey>(root, ':scope [data-mute]');
	const volume = find<SonicDial>(root, ':scope [data-volume]');

	bar.play.addEventListener('change', () => {
		player.isPlaying = bar.play.pressed;
		if (!player.isPlaying) return;
		if (!player.isLoaded) load(player, player.index);
		if (player.positionSeconds >= trackOf(player).durationSeconds) seek(player, 0);
	});
	bar.previous.addEventListener('click', () => {
		if (player.positionSeconds > restartSeconds) seek(player, 0);
		else load(player, player.index - 1);
	});
	bar.next.addEventListener('click', () => {
		load(player, player.index + 1);
	});
	for (const key of bar.seekKeys) {
		key.addEventListener('click', () => {
			seek(player, player.positionSeconds + Number(key.dataset.seekBy));
		});
	}
	// `change` rather than `input`, so playback carries on while scrubbing
	bar.strip.addEventListener('change', () => {
		seek(player, bar.strip.value);
	});
	bar.panelToggle.addEventListener('change', () => {
		panel.hidden = !bar.panelToggle.pressed;
	});
	mute.addEventListener('change', () => {
		volume.dimmed = mute.pressed;
	});
	volume.formatValue = formatPercent;
	volume.parseValue = parsePercent;
	bar.strip.formatValue = formatClock;
}

function bindPlayer(root: Element): void {
	const bar = readBar(root);
	const player: Player = {
		buffered: [],
		index: 0,
		isLoaded: false,
		isPlaying: false,
		latencySeconds: 0,
		positionSeconds: 0,
	};
	let zoom = 2;
	let frame: number | undefined;
	let last: number | undefined;
	const tick = (time: number): void => {
		const elapsedSeconds = last === undefined ? 0 : Math.min((time - last) / 1000, 0.1);

		last = time;
		fill(player, elapsedSeconds);
		advance(player, elapsedSeconds);
		if (bar.play.pressed !== player.isPlaying) bar.play.pressed = player.isPlaying;
		renderText(player, bar);
		renderAvailability(player, bar, zoom);
		renderStrip(player, bar.strip);
		if (player.isPlaying || isFilling(player)) {
			frame = requestAnimationFrame(tick);
			return;
		}

		frame = undefined;
		last = undefined;
	};
	// Paused with the buffer full, nothing redraws until a control acts
	const wake = (): void => {
		frame = frame ?? requestAnimationFrame(tick);
	};

	bindControls(root, player, bar);
	for (const key of bar.zoomKeys) {
		key.addEventListener('click', () => {
			zoom += Number(key.dataset.zoom);
		});
	}
	root.addEventListener('change', wake);
	root.addEventListener('click', wake);
	wake();
}

for (const root of document.querySelectorAll('[data-web-player]')) bindPlayer(root);
