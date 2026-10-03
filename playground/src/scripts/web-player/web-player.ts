import {
	formatPercent,
	parsePercent,
	SonicDial,
	SonicKey,
	SonicSlider,
	SonicWaveform,
	SonicWavestrip,
} from '@xsynaptic/sonic-ui';
import { readDatWaveformData } from '@xsynaptic/sonic-ui/dat';

import type { ControlsOf } from '#scripts/find.ts';
import type { StreamState } from '#scripts/web-player/stream.ts';

import { dataHook, readControls } from '#scripts/find.ts';
import { frameLoop } from '#scripts/frame-loop.ts';
import { seededHeader } from '#scripts/seeded-dat.ts';
import { createStream, tracks } from '#scripts/web-player/stream.ts';

const barSpec = {
	artist: HTMLElement,
	detail: SonicWaveform,
	next: SonicKey,
	panelToggle: SonicKey,
	play: SonicKey,
	previous: SonicKey,
	seek: SonicSlider,
	time: HTMLButtonElement,
	title: HTMLElement,
	wave: SonicWavestrip,
};

interface Bar extends ControlsOf<typeof barSpec> {
	seekKeys: Array<SonicKey>;
	zoomKeys: Array<SonicKey>;
}

const zoomLadder = [30, 45, 70, 105, 160];

const spokenUnits = [
	['hour', 3600],
	['minute', 60],
	['second', 1],
] as const;

function formatClock(seconds: number): string {
	const total = Math.floor(Math.abs(seconds));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor(total / 60) % 60;
	const rest = String(total % 60).padStart(2, '0');
	const sign = seconds < 0 ? '−' : '';

	if (hours === 0) return `${sign}${String(minutes)}:${rest}`;

	return `${sign}${String(hours)}:${String(minutes).padStart(2, '0')}:${rest}`;
}

function formatSpokenTime(seconds: number): string {
	let rest = Math.floor(seconds);
	const spoken: Array<string> = [];

	for (const [unit, span] of spokenUnits) {
		const amount = Math.floor(rest / span);

		rest -= amount * span;
		if (amount > 0) {
			spoken.push(
				new Intl.NumberFormat('en', { style: 'unit', unit, unitDisplay: 'long' }).format(amount),
			);
		}
	}

	return spoken.length > 0 ? spoken.join(' ') : '0 seconds';
}

function readBar(root: Element): Bar {
	return {
		...readControls(root, barSpec, dataHook),
		seekKeys: [...root.querySelectorAll<SonicKey>(':scope [data-seek-by]')],
		zoomKeys: [...root.querySelectorAll<SonicKey>(':scope [data-zoom]')],
	};
}

function writeText(element: HTMLElement, text: string): void {
	if (element.textContent !== text) element.textContent = text;
}

function renderText(state: StreamState, bar: Bar): void {
	const { positionSeconds, track } = state;
	const isRemaining = bar.time.getAttribute('aria-pressed') === 'true';
	const shown = isRemaining ? positionSeconds - track.durationSeconds : positionSeconds;

	writeText(bar.title, track.title);
	writeText(bar.artist, track.artist);
	writeText(bar.time, state.isLoaded ? formatClock(shown) : '--:--');
}

function renderAvailability(state: StreamState, bar: Bar, zoom: number): void {
	bar.play.toggleAttribute('busy', state.isWaiting);
	bar.previous.toggleAttribute('soft-disabled', !state.canPrevious);
	bar.next.toggleAttribute('soft-disabled', !state.canNext);
	for (const control of [
		...bar.seekKeys,
		bar.seek,
		bar.wave,
		bar.detail,
		bar.time,
		bar.panelToggle,
	]) {
		control.toggleAttribute('disabled', !state.isLoaded);
	}
	for (const key of bar.zoomKeys) {
		const next = zoom + Number(key.dataset.zoom);

		key.toggleAttribute('soft-disabled', next < 0 || next >= zoomLadder.length);
	}
}

function renderTrack({ samples, track }: StreamState, bar: Bar): void {
	for (const strip of [bar.seek, bar.wave, bar.detail]) strip.max = track.durationSeconds;
	for (const strip of [bar.wave, bar.detail]) strip.markers = track.cues;
	bar.wave.peaks = track.peaks;
	bar.detail.data = readDatWaveformData(seededHeader, samples.buffer);
}

function renderPosition(state: StreamState, bar: Bar): void {
	const isPlaying = state.isPlaying && !state.isWaiting;

	for (const strip of [bar.seek, bar.wave, bar.detail]) strip.value = state.positionSeconds;
	bar.seek.buffered = state.buffered;
	bar.wave.buffered = state.buffered;
	if (bar.detail.playing !== isPlaying) bar.detail.playing = isPlaying;
	if (String(state.pending) !== String(bar.detail.pending)) bar.detail.pending = state.pending;
}

function bindControls(root: Element, stream: ReturnType<typeof createStream>, bar: Bar): void {
	const { mute, panel, volume } = readControls(
		root,
		{ mute: SonicKey, panel: HTMLElement, volume: SonicDial },
		dataHook,
	);

	bar.play.addEventListener('change', () => {
		if (!bar.play.pressed) {
			stream.pause();
			return;
		}

		stream.play();
	});
	bar.previous.addEventListener('click', () => {
		stream.previous();
	});
	bar.next.addEventListener('click', () => {
		stream.next();
	});
	for (const key of bar.seekKeys) {
		key.addEventListener('click', () => {
			stream.seek(stream.state.positionSeconds + Number(key.dataset.seekBy));
		});
	}
	for (const strip of [bar.seek, bar.wave, bar.detail]) {
		strip.addEventListener('change', () => {
			stream.seek(strip.value);
		});
		strip.formatValue = (seconds) => {
			const cue = stream.state.track.cues?.findLast((entry) => entry.value <= seconds);

			return cue ? `${formatClock(seconds)} · ${cue.label}` : formatClock(seconds);
		};
		strip.formatValueText = formatSpokenTime;
	}
	bar.time.addEventListener('click', () => {
		bar.time.setAttribute('aria-pressed', String(bar.time.getAttribute('aria-pressed') !== 'true'));
	});
	bar.panelToggle.addEventListener('change', () => {
		panel.hidden = !bar.panelToggle.pressed;
	});
	mute.addEventListener('change', () => {
		volume.dimmed = mute.pressed;
	});
	volume.formatValue = formatPercent;
	volume.parseValue = parsePercent;
}

function bindPlayer(root: Element): void {
	const bar = readBar(root);
	const stream = createStream(tracks);
	let zoom = 2;
	let shownSamples: Int8Array | undefined;
	const loop = frameLoop((elapsedSeconds) => {
		const { hasLanded, isActive } = stream.tick(elapsedSeconds);
		const { state } = stream;

		if (hasLanded) bar.detail.repaint();
		if (state.samples !== shownSamples) {
			shownSamples = state.samples;
			renderTrack(state, bar);
		}
		if (bar.play.pressed !== state.isPlaying) bar.play.pressed = state.isPlaying;
		renderText(state, bar);
		renderAvailability(state, bar, zoom);
		renderPosition(state, bar);

		return isActive;
	});

	bindControls(root, stream, bar);
	bar.detail.zoom = zoomLadder[zoom];
	bar.detail.readTime = () => stream.state.positionSeconds;
	bar.detail.requestSpan = (fromSeconds, toSeconds) => {
		stream.wantSamples(fromSeconds, toSeconds);
		loop.wake();
	};
	for (const key of bar.zoomKeys) {
		key.addEventListener('click', () => {
			zoom = Math.min(Math.max(zoom + Number(key.dataset.zoom), 0), zoomLadder.length - 1);
			bar.detail.zoom = zoomLadder[zoom];
		});
	}
	root.addEventListener('change', loop.wake);
	root.addEventListener('click', loop.wake);
	loop.start();
}

for (const root of document.querySelectorAll('[data-web-player]')) bindPlayer(root);
