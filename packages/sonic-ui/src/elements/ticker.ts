import type { TickerDeparture, TickerHeading, TickerLeg, TickerTravel } from '#lib/ticker-leg.ts';

import { SonicElement } from '#elements/sonic-element.ts';
import { outsideCancelZone } from '#lib/cancel-zone.ts';
import { copyNode } from '#lib/copy-node.ts';
import { dragThresholdPx } from '#lib/drag-step.ts';
import { clamp } from '#lib/math.ts';
import { mirrorChildren } from '#lib/mirror-children.ts';
import { bindDrag, capturePointer } from '#lib/pointer-drag.ts';
import { readMsProperty } from '#lib/read-ms-property.ts';
import { readPxProperty } from '#lib/read-px-property.ts';
import { placeChildren, requireChild, template } from '#lib/render.ts';
import {
	clippedEnds,
	fadeWidth,
	legDeparture,
	legFades,
	legPosition,
	tickerLeg,
} from '#lib/ticker-leg.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

declare global {
	interface HTMLElementTagNameMap {
		'sonic-ticker': SonicTicker;
	}
}

const renderTicker = template(
	/* HTML */ `<span class="sonic-ticker"><span class="sonic-ticker-tape"></span></span>`,
	HTMLSpanElement,
);

const fadePx = 12;

const holdMs = 2000;

const ratePxPerSecond = 40;

interface Running {
	animation: Animation;
	fades: Array<Animation>;
	leg: TickerLeg;
}

interface TapeDrag {
	from: number;
	isDragging: boolean;
	outside: ((event: PointerEvent) => boolean) | undefined;
	thresholdPx: number;
	x: number;
}

export class SonicTicker extends SonicElement {
	static override readonly observedAttributes = ['paused'];

	// fallow-ignore-next-line code-duplication -- one accessor pair per reflected attribute
	get cancellable(): boolean {
		return this.hasAttribute('cancellable');
	}

	set cancellable(isCancellable: boolean) {
		this.reflect('cancellable', isCancellable);
	}

	get paused(): boolean {
		return this.hasAttribute('paused');
	}

	set paused(isPaused: boolean) {
		this.reflect('paused', isPaused);
	}

	get text(): string {
		return this.#originals()
			.map((original) => original.textContent)
			.join('');
	}

	set text(text: string | undefined) {
		for (const original of this.#originals()) original.remove();
		if (text !== undefined && text !== '') this.prepend(text);
	}

	protected override readonly control = renderTicker();

	protected override readonly sheet = 'ticker.css';

	protected override readonly sheetToken = '--_sonic-ticker-fade';

	#fade = fadePx;

	#heading: TickerHeading = 1;

	#isClickSwallowed = false;

	#isFocusInside = false;

	#isHovered = false;

	#isOffScreen = false;

	#isPressed = false;

	#mark: ReturnType<typeof setTimeout> | undefined;

	#measured = '';

	#position = 0;

	readonly #reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

	#running: Running | undefined;

	#travel: TickerTravel = { distance: 0, hold: holdMs, rate: ratePxPerSecond };

	attributeChangedCallback(): void {
		this.render();
	}

	protected connect(signal: AbortSignal): void {
		const control = this.control;
		const tape = requireChild(control, '.sonic-ticker-tape', HTMLSpanElement);
		const measure = (): void => {
			this.#measure(tape);
		};
		const observer = new ResizeObserver(measure);
		const drag = this.#bindDrag(tape, signal);

		this.upgradeProperties('cancellable', 'paused', 'text');
		mirrorChildren(
			this,
			{
				canCopyLinks: true,
				control,
				copy: copyNode,
				place: (copies) => {
					placeChildren(tape, copies);
					drag.end();
					this.#measure(tape, { from: 0, heading: 1 });
				},
			},
			signal,
		);
		this.render();

		observer.observe(control);
		observer.observe(tape);
		if ('fonts' in document) document.fonts.addEventListener('loadingdone', measure, { signal });
		this.#bindFocus(tape, signal);
		this.#bindPauses(signal);
		this.#reducedMotion.addEventListener(
			'change',
			() => {
				this.#run(tape);
			},
			{ signal },
		);
		signal.addEventListener(
			'abort',
			() => {
				observer.disconnect();
				this.#stop();
			},
			{ once: true },
		);
	}

	protected render(): void {
		if (!this.isBound()) return;

		this.toggleState('paused', this.paused);
		this.#syncPause();
	}

	#bindDrag(tape: HTMLElement, signal: AbortSignal): { end: () => void } {
		const control = this.control;

		control.addEventListener(
			'click',
			(event) => {
				if (!this.#isClickSwallowed) return;

				this.#isClickSwallowed = false;
				event.preventDefault();
				event.stopPropagation();
			},
			{ capture: true, signal },
		);
		// In WebKit, dragging a link that wraps the ticker fires `dragstart` on the link, outside the control
		this.getRootNode().addEventListener(
			'dragstart',
			(event) => {
				if (this.#isPressed) event.preventDefault();
			},
			{ signal },
		);

		return bindDrag<TapeDrag>(
			control,
			{
				grab: (event) => {
					if (this.#travel.distance <= 0) return;

					return {
						from: 0,
						isDragging: false,
						outside: undefined,
						thresholdPx: dragThresholdPx(event.pointerType),
						x: event.clientX,
					};
				},
				isCaptureLate: true,
				move: (held, event) => {
					if (!held.isDragging) {
						if (Math.abs(event.clientX - held.x) < held.thresholdPx) return;

						const { from, heading } = this.#where();

						held.isDragging = true;
						held.from = from;
						held.outside = this.cancellable
							? outsideCancelZone(control, '--_sonic-ticker-cancel-zone')
							: undefined;
						held.x = event.clientX;
						capturePointer(control, event.pointerId);
						this.toggleState('dragging', true);
						this.#stop();
						this.#heading = heading;
					}

					const isOutside = held.outside?.(event) === true;

					this.toggleState('cancelling', isOutside);
					this.#place(tape, isOutside ? held.from : held.from - (event.clientX - held.x));
				},
				release: (held) => {
					if (!held.isDragging) return;

					// Safari sends no click after a drag, so the flag is cleared on a timer or it would cancel the next real click
					this.#isClickSwallowed = true;
					setTimeout(() => {
						this.#isClickSwallowed = false;
					}, 0);
					this.toggleState('dragging', false);
					this.toggleState('cancelling', false);
					this.#run(tape);
				},
				toggle: (isPressed) => {
					this.#isPressed = isPressed;
					this.#syncPause();
				},
			},
			signal,
		);
	}

	#bindFocus(tape: HTMLElement, signal: AbortSignal): void {
		const control = this.control;

		control.addEventListener(
			'focusout',
			(event) => {
				if (event.relatedTarget instanceof Node && control.contains(event.relatedTarget)) return;

				control.scrollLeft = 0;
				this.#isFocusInside = false;
				this.#run(tape);
			},
			{ signal },
		);
		control.addEventListener(
			'focusin',
			(event) => {
				this.#isFocusInside = true;
				this.#run(tape);
				if (event.target instanceof Element) event.target.scrollIntoView({ block: 'nearest' });
			},
			{ signal },
		);
	}

	#bindPauses(signal: AbortSignal): void {
		const control = this.control;

		for (const type of ['pointerenter', 'pointerleave'] as const) {
			control.addEventListener(
				type,
				(event) => {
					if (event.pointerType !== 'mouse') return;

					this.#isHovered = type === 'pointerenter';
					this.#syncPause();
				},
				{ signal },
			);
		}
		for (const type of ['focusin', 'focusout'] as const) {
			this.getRootNode().addEventListener(
				type,
				() => {
					this.#syncPause();
				},
				{ signal },
			);
		}

		const view = new IntersectionObserver((entries) => {
			this.#isOffScreen = entries.at(-1)?.isIntersecting === false;
			this.#syncPause();
		});

		view.observe(control);
		signal.addEventListener(
			'abort',
			() => {
				view.disconnect();
			},
			{ once: true },
		);
	}

	#isPaused(): boolean {
		return (
			this.paused ||
			this.#isHovered ||
			this.#isPressed ||
			this.#isOffScreen ||
			this.control.closest(':focus-visible') !== null
		);
	}

	#measure(tape: HTMLElement, departure?: TickerDeparture): void {
		const control = this.control;
		const styles = getComputedStyle(control);
		const box =
			control.clientWidth -
			readPxProperty(styles, 'padding-left', 0) -
			readPxProperty(styles, 'padding-right', 0);
		const travel = {
			distance: Math.max(0, Math.round(tape.offsetWidth - box)),
			hold: readMsProperty(styles, '--_sonic-ticker-hold', holdMs),
			rate: readPxProperty(styles, '--_sonic-ticker-rate', ratePxPerSecond),
		};
		const fade = readPxProperty(styles, '--_sonic-ticker-fade', fadePx);
		const measured = [...Object.values(travel), fade].join(' ');
		if (!departure && measured === this.#measured) return;

		const from = departure ?? this.#where();

		this.#fade = fade;
		this.#measured = measured;
		this.#travel = travel;
		this.toggleState('overflowing', travel.distance > 0);
		this.#run(tape, from);
	}

	#originals(): Array<ChildNode> {
		return [...this.childNodes].filter((child) => child !== this.control);
	}

	#place(tape: HTMLElement, position: number): void {
		const { distance } = this.#travel;

		this.#position = clamp(position, 0, distance);
		tape.style.translate = this.#position > 0 ? `${String(-this.#position)}px` : '';
		writeAttribute(this.control, 'data-sonic-clipped', clippedEnds(this.#position, distance));
		this.#writeFades(this.#position);
	}

	#run(tape: HTMLElement, departure: TickerDeparture = this.#where()): void {
		const canTravel =
			!this.#isFocusInside && !this.#reducedMotion.matches && !this.hasState('dragging');
		const leg = canTravel ? tickerLeg(this.#travel, departure) : undefined;

		this.#stop();
		this.#heading = departure.heading;
		if (leg) this.#start(tape, leg);
		else this.#place(tape, this.#isFocusInside ? 0 : departure.from);
	}

	#start(tape: HTMLElement, leg: TickerLeg): void {
		const animation = tape.animate(
			{ translate: [`${String(-leg.from)}px`, `${String(-leg.to)}px`] },
			{ delay: leg.hold, duration: leg.duration, fill: 'both' },
		);

		animation.addEventListener('finish', () => {
			this.#run(tape, { from: leg.to, heading: leg.heading });
		});
		this.#running = { animation, fades: [], leg };
		tape.style.translate = '';
		writeAttribute(
			this.control,
			'data-sonic-clipped',
			clippedEnds(leg.from, this.#travel.distance),
		);
		this.#syncPause();
	}

	#startFades(leg: TickerLeg, elapsed: number): Array<Animation> {
		const fades = legFades(leg, this.#travel.distance, this.#fade);

		return (['start', 'end'] as const).flatMap((end) => {
			const { delay, duration, widths } = fades[end];
			if (duration <= 0 || delay + duration <= elapsed) return [];

			return this.control.animate(
				{ [`--_sonic-ticker-fade-${end}`]: widths.map((width) => `${String(width)}px`) },
				{ delay: delay - elapsed, duration, fill: 'both' },
			);
		});
	}

	#stop(): void {
		const running = this.#running;

		clearTimeout(this.#mark);
		if (!running) return;

		for (const fade of running.fades) fade.cancel();
		running.animation.cancel();
		this.#running = undefined;
	}

	// Calling `play()` on a finished animation restarts it, so the fades are recreated on resume, not paused
	#syncPause(): void {
		const running = this.#running;
		if (!running) return;

		const { animation, leg } = running;
		const elapsed = Number(animation.currentTime);

		clearTimeout(this.#mark);
		for (const fade of running.fades) fade.cancel();
		running.fades = [];
		this.#writeFades(legPosition(leg, elapsed));
		if (elapsed >= leg.hold) writeAttribute(this.control, 'data-sonic-clipped', 'start end');
		if (this.#isPaused()) {
			animation.pause();
			return;
		}
		if (animation.playState === 'paused') animation.play();
		running.fades = this.#startFades(leg, elapsed);
		if (elapsed >= leg.hold) return;

		this.#mark = setTimeout(() => {
			writeAttribute(this.control, 'data-sonic-clipped', 'start end');
		}, leg.hold - elapsed);
	}

	#where(): TickerDeparture {
		const running = this.#running;
		if (!running) return { from: this.#position, heading: this.#heading };

		return legDeparture(running.leg, Number(running.animation.currentTime));
	}

	#writeFades(position: number): void {
		const { style } = this.control;

		style.setProperty('--_sonic-ticker-fade-start', `${String(fadeWidth(position, this.#fade))}px`);
		style.setProperty(
			'--_sonic-ticker-fade-end',
			`${String(fadeWidth(this.#travel.distance - position, this.#fade))}px`,
		);
	}
}
