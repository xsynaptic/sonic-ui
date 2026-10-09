import type { RegionLink } from '#elements/region.ts';
import type { RegionDragState, RegionSpan } from '#lib/region-drag.ts';
import type { ValueMapping } from '#lib/value-mapping.ts';

import { linkRegion, ownRegions, SonicRegion } from '#elements/region.ts';
import { dragThresholdPx } from '#lib/drag-step.ts';
import { focusByPointer } from '#lib/focus-by-pointer.ts';
import { writeKind } from '#lib/marker-band.ts';
import { capturePointer } from '#lib/pointer-drag.ts';
import {
	moveRegionTo,
	regionAt,
	regionTravel,
	startRegionDrag,
	stepRegionDrag,
} from '#lib/region-drag.ts';
import { placeChildren, template } from '#lib/render.ts';
import { writeAttribute } from '#lib/write-attribute.ts';

interface LayerHost {
	axis: () => { startPx: number; travelPx: number };
	control: HTMLElement;
	element: HTMLElement;
	isDisabled: () => boolean;
	layer: HTMLElement;
	mapping: () => ValueMapping;
	outside: () => ((event: PointerEvent) => boolean) | undefined;
	seek: (event: PointerEvent) => void;
	speak: (span: RegionSpan) => string;
}

interface Drawn {
	kind: string | undefined;
	link: RegionLink;
	part: HTMLElement;
	region: SonicRegion;
}

interface KeyScrub {
	drawn: Drawn;
	from: RegionSpan;
	key: string;
}

interface PointerHold {
	drawn: Drawn;
	from: RegionSpan;
	outside: ((event: PointerEvent) => boolean) | undefined;
	pointerId: number;
	press: PointerEvent;
	state: RegionDragState;
}

const renderPart = template(
	/* HTML */ `
		<div class="sonic-region" role="slider" aria-orientation="horizontal">
			<div class="sonic-region-bracket"></div>
		</div>
	`,
	HTMLDivElement,
);

function hasMoved(from: RegionSpan, to: RegionSpan): boolean {
	return from.start !== to.start || from.end !== to.end;
}

function clippedEnds(region: SonicRegion, [low, high]: [number, number]): string | undefined {
	const ends = [
		...(Math.min(region.start, region.end) < low ? ['start'] : []),
		...(Math.max(region.start, region.end) > high ? ['end'] : []),
	];

	return ends.length > 0 ? ends.join(' ') : undefined;
}

function writeProperty(part: HTMLElement, name: string, value: string): void {
	if (part.style.getPropertyValue(name) !== value) part.style.setProperty(name, value);
}

export class RegionLayer {
	#drawn: Array<Drawn> = [];

	#held: PointerHold | undefined;

	readonly #host: LayerHost;

	#key: string | undefined;

	#keyScrub: KeyScrub | undefined;

	constructor(host: LayerHost, signal: AbortSignal) {
		const render = (): void => {
			this.render();
		};
		const observer = new MutationObserver(render);

		this.#host = host;
		this.#bindPointer(signal);
		this.#bindKeys(signal);
		observer.observe(host.element, { childList: true });
		ownRegions(
			host.element,
			(region) => {
				this.#redraw(region);
			},
			signal,
		);
		signal.addEventListener(
			'abort',
			() => {
				observer.disconnect();
				this.#release();
				this.#endKeyScrub();
			},
			{ once: true },
		);
	}

	abandon(): void {
		this.#release(true);
	}

	follow(): void {
		if (this.#drawn.length === 0) return;
		if (this.#stripKey() !== this.#key) this.render();
	}

	isHeld(): boolean {
		return this.#held !== undefined;
	}

	render(): void {
		const host = this.#host;
		const regions = [...host.element.children].filter((child) => child instanceof SonicRegion);
		const drawn = regions.map((region) => this.#draw(region));

		this.#drawn = drawn;
		this.#key = this.#stripKey();
		placeChildren(
			host.layer,
			drawn.map(({ part }) => part),
		);
		this.#dropGone();
	}

	take(event: PointerEvent): boolean {
		const host = this.#host;
		const { startPx, travelPx } = host.axis();
		const mapping = host.mapping();
		const index = regionAt(
			this.#drawn.map((entry) => {
				if (!this.#isEnabled(entry)) return;

				const { end, start } = entry.link.span();

				return [mapping.proportionOf(start) * travelPx, mapping.proportionOf(end) * travelPx];
			}),
			event.clientX - startPx,
		);
		const pressed = index === undefined ? undefined : this.#drawn[index];
		if (!pressed) return false;

		this.#endKeyScrub();

		const from = pressed.link.span();

		this.#held = {
			drawn: pressed,
			from,
			outside: host.outside(),
			pointerId: event.pointerId,
			press: event,
			state: startRegionDrag({
				from,
				position: event.clientX,
				thresholdPx: dragThresholdPx(event.pointerType),
				widthPx: travelPx,
			}),
		};
		pressed.link.hold('pointer');
		capturePointer(host.control, event.pointerId);

		return true;
	}

	#bindKeys(signal: AbortSignal): void {
		const { layer } = this.#host;

		layer.addEventListener(
			'keydown',
			(event) => {
				const entry = this.#drawn.find(({ part }) => part === event.target);
				if (!entry || event.defaultPrevented || this.#held) return;

				if (this.#isEnabled(entry)) this.#keyTo(entry, event);
			},
			{ signal },
		);
		layer.addEventListener(
			'keyup',
			(event) => {
				// macOS sends no `keyup` for a key let go while Cmd is down
				if (event.key === 'Meta' || event.key === this.#keyScrub?.key) this.#endKeyScrub();
			},
			{ signal },
		);
		// No event fires when a label arrives, so focus picks it up
		layer.addEventListener(
			'focusin',
			() => {
				this.render();
			},
			{ signal },
		);
		layer.addEventListener(
			'focusout',
			() => {
				this.#endKeyScrub();
			},
			{ signal },
		);
	}

	#bindPointer(signal: AbortSignal): void {
		const whileHeld = (
			type: string,
			handle: (hold: PointerHold, event: PointerEvent) => void,
		): void => {
			this.#host.control.addEventListener(
				type,
				(event) => {
					const held = this.#held;

					if (held && event instanceof PointerEvent && held.pointerId === event.pointerId) {
						handle(held, event);
					}
				},
				{ signal },
			);
		};

		whileHeld('pointermove', (hold, event) => {
			this.#dragTo(hold, event);
		});
		whileHeld('pointerup', (hold) => {
			const isPress = !hold.state.isEngaged;

			this.#release();
			if (isPress) this.#host.seek(hold.press);
		});
		whileHeld('pointercancel', () => {
			this.#release(true);
		});
		whileHeld('lostpointercapture', () => {
			this.#release();
		});
	}

	#dragTo(hold: PointerHold, event: PointerEvent): void {
		const wasEngaged = hold.state.isEngaged;
		const { span, state } = stepRegionDrag(this.#host.mapping(), hold.state, {
			isFine: event.shiftKey,
			position: event.clientX,
		});

		hold.state = state;
		if (!span) return;

		if (!wasEngaged) focusByPointer(hold.drawn.part);
		hold.drawn.link.input(hold.outside?.(event) === true ? hold.from : span);
	}

	#draw(region: SonicRegion): Drawn {
		const host = this.#host;
		const known = this.#drawn.find((entry) => entry.region === region);
		const entry = known ?? {
			kind: undefined,
			link: linkRegion(region),
			part: renderPart(),
			region,
		};
		const { link, part } = entry;
		const mapping = host.mapping();
		const span = link.span();
		const [low, high] = regionTravel(span, mapping.bounds);
		const canMove = this.#isEnabled(entry);
		const stop = region.getAttribute('tabindex') === '-1' ? '-1' : '0';

		writeProperty(part, '--_sonic-region-from', String(mapping.proportionOf(span.start)));
		writeProperty(part, '--_sonic-region-to', String(mapping.proportionOf(span.end)));
		if (!known || entry.kind !== region.kind) {
			entry.kind = region.kind;
			writeKind(part, region.kind, '--_sonic-ink');
		}
		writeAttribute(part, 'data-sonic-clipped', clippedEnds(region, mapping.bounds));
		writeAttribute(part, 'aria-valuemin', String(low));
		writeAttribute(part, 'aria-valuemax', String(high));
		writeAttribute(part, 'aria-valuenow', String(span.start));
		writeAttribute(part, 'aria-valuetext', host.speak(span));
		writeAttribute(part, 'aria-disabled', canMove ? undefined : 'true');
		writeAttribute(part, 'tabindex', canMove ? stop : undefined);
		link.draw(part);

		return entry;
	}

	#dropGone(): void {
		const isGone = (entry: Drawn): boolean =>
			!this.#drawn.includes(entry) || !this.#isEnabled(entry);

		if (this.#held && isGone(this.#held.drawn)) this.#release();
		if (this.#keyScrub && isGone(this.#keyScrub.drawn)) this.#endKeyScrub();
	}

	#endKeyScrub(): void {
		const scrub = this.#keyScrub;
		if (!scrub) return;

		const { link } = scrub.drawn;

		this.#keyScrub = undefined;
		link.hold(undefined);
		if (hasMoved(scrub.from, link.span())) link.change();
	}

	#isEnabled({ link }: Drawn): boolean {
		return !this.#host.isDisabled() && !link.isDisabled();
	}

	#keyTo(entry: Drawn, event: KeyboardEvent): void {
		const mapping = this.#host.mapping();
		const from = entry.link.span();
		const start = mapping.keyTarget(event.key, from.start);
		if (start === undefined) return;

		event.preventDefault();

		const next = moveRegionTo(mapping, from, start);

		if (!event.repeat) {
			this.#endKeyScrub();
			if (entry.link.input(next)) entry.link.change();
			return;
		}

		if (this.#keyScrub?.drawn !== entry || this.#keyScrub.key !== event.key) {
			this.#endKeyScrub();
			this.#keyScrub = { drawn: entry, from, key: event.key };
			entry.link.hold('keys');
		}
		entry.link.input(next);
	}

	#redraw(region: SonicRegion): void {
		if (this.#drawn.every((entry) => entry.region !== region)) {
			this.render();
			return;
		}

		this.#draw(region);
		this.#dropGone();
	}

	#release(isRestored = false): void {
		const hold = this.#held;
		if (!hold) return;

		const { link } = hold.drawn;

		this.#held = undefined;
		if (isRestored) link.input(hold.from);
		link.hold(undefined);
		if (hasMoved(hold.from, link.span())) link.change();
	}

	// A changed value formatter is told by what it says of one time
	#stripKey(): string {
		const host = this.#host;
		const mapping = host.mapping();
		const [low, high] = mapping.bounds;

		return [
			low,
			high,
			mapping.proportionOf((low + high) / 2),
			host.isDisabled(),
			host.speak({ end: high, start: high }),
		].join('|');
	}
}
