import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { SonicTicker } from '#elements/ticker.ts';

import '#define/ticker.ts';

import { nextTask, pointerAt } from './helpers.ts';

const widths = { box: 0, tape: 0 };

beforeEach(() => {
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
		this: HTMLElement,
	) {
		return this.classList.contains('sonic-ticker-tape') ? widths.tape : 0;
	});
	vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
		this: HTMLElement,
	) {
		return this.classList.contains('sonic-ticker') ? widths.box : 0;
	});
});

afterEach(() => {
	document.head.replaceChildren();
	document.body.replaceChildren();
});

async function mountTicker(
	children: string,
	box: number,
	tape: number,
): Promise<{ control: HTMLElement; tape: HTMLElement; ticker: SonicTicker }> {
	Object.assign(widths, { box, tape });
	document.body.innerHTML = `<sonic-ticker>${children}</sonic-ticker>`;
	await nextTask();

	const ticker = document.querySelector('sonic-ticker');
	const control = ticker?.querySelector<HTMLElement>('.sonic-ticker');
	const drawn = control?.querySelector<HTMLElement>('.sonic-ticker-tape');
	if (!ticker || !control || !drawn) throw new Error('The ticker did not render');

	return { control, tape: drawn, ticker };
}

interface FakeLeg {
	delay: number;
	duration: number;
	translate: Array<string>;
}

class FakeAnimation extends EventTarget {
	currentTime = 0;

	playState = 'running';

	cancel(): void {
		// Nothing to cancel in the fake
	}

	pause(): void {
		this.playState = 'paused';
	}

	play(): void {
		this.playState = 'running';
	}
}

function fakeLegs(): { finish: () => void; legs: Array<FakeLeg> } {
	const legs: Array<FakeLeg> = [];
	let last: FakeAnimation | undefined;

	HTMLElement.prototype.animate = function (keyframes, options) {
		if (typeof options !== 'object' || !keyframes) {
			throw new TypeError('An animation is asked for with its timing');
		}
		if (!('translate' in keyframes)) return new FakeAnimation() as unknown as Animation;

		last = new FakeAnimation();
		legs.push({
			delay: Number(options.delay),
			duration: Number(options.duration),
			translate: keyframes.translate as Array<string>,
		});

		return last as unknown as Animation;
	};

	return {
		finish: () => {
			last?.dispatchEvent(new Event('finish'));
		},
		legs,
	};
}

test('content that fits is not overflowing and is given no leg', async () => {
	const { legs } = fakeLegs();
	const { control } = await mountTicker('Short', 300, 180);

	expect(control.matches('[data-sonic-overflowing]')).toBe(false);
	expect(Object.hasOwn(control.dataset, 'sonicClipped')).toBe(false);
	expect(legs).toEqual([]);
});

test('the distance is the tape less the box inside its padding, crossed at the default rate after the default hold', async () => {
	document.head.innerHTML =
		'<style>.sonic-ticker { padding-left: 8px; padding-right: 12px; }</style>';

	const { legs } = fakeLegs();
	const { control } = await mountTicker('A long title', 300, 335);

	expect(control.matches('[data-sonic-overflowing]')).toBe(true);
	expect(control.dataset.sonicClipped).toBe('end');
	expect(legs.at(-1)).toEqual({ delay: 2000, duration: 1375, translate: ['0px', '-55px'] });
});

test('the rate and the hold are read from the control, the hold in either unit', async () => {
	document.head.innerHTML =
		'<style>.sonic-ticker { --_sonic-ticker-rate: 60px; --_sonic-ticker-hold: 2500ms; }</style>';

	const { legs } = fakeLegs();

	await mountTicker('A long title', 300, 600);

	expect(legs.at(-1)).toEqual({ delay: 2500, duration: 5000, translate: ['0px', '-300px'] });
});

test('a leg that finishes starts the leg back, after the hold, with the start clipped', async () => {
	const { finish, legs } = fakeLegs();
	const { control } = await mountTicker('A long title', 300, 355);

	finish();

	expect(legs.at(-1)).toEqual({ delay: 2000, duration: 1375, translate: ['-55px', '0px'] });
	expect(control.dataset.sonicClipped).toBe('start');
});

test('a rate of zero leaves the ticker overflowing with no leg', async () => {
	document.head.innerHTML = '<style>.sonic-ticker { --_sonic-ticker-rate: 0px; }</style>';

	const { legs } = fakeLegs();
	const { control } = await mountTicker('A long title', 300, 355);

	expect(control.matches('[data-sonic-overflowing]')).toBe(true);
	expect(legs).toEqual([]);
});

test('new content of the same width starts over, and content that now fits ends the travel', async () => {
	const { finish, legs } = fakeLegs();
	const { control, tape, ticker } = await mountTicker('A long title', 300, 355);

	finish();
	expect(legs.at(-1)?.translate).toEqual(['-55px', '0px']);

	const before = legs.length;

	ticker.text = 'Another title';
	await nextTask();

	expect(tape.textContent).toBe('Another title');
	expect(legs).toHaveLength(before + 1);
	expect(legs.at(-1)?.translate).toEqual(['0px', '-55px']);

	widths.tape = 120;
	ticker.text = 'Short';
	await nextTask();

	expect(control.matches('[data-sonic-overflowing]')).toBe(false);
	expect(Object.hasOwn(control.dataset, 'sonicClipped')).toBe(false);
	expect(legs).toHaveLength(before + 1);
});

test('the same text written again leaves the tape where it is', async () => {
	const { finish, legs } = fakeLegs();
	const { ticker } = await mountTicker('A long title', 300, 355);

	finish();

	const before = legs.length;
	const original = ticker.firstChild;

	ticker.text = 'A long title';
	await nextTask();

	expect(ticker.firstChild).toBe(original);
	expect(legs).toHaveLength(before);
});

test('the same words as a link are still replaced by plain text', async () => {
	const { tape, ticker } = await mountTicker('<a href="/release/">Title</a>', 300, 180);

	ticker.text = 'Title';
	await nextTask();

	expect(tape.getHTML()).toBe('Title');
});

test('a press drags the tape once it has moved past the threshold, clamps at each end and lets go into a leg from there', async () => {
	const { legs } = fakeLegs();
	const { control, tape } = await mountTicker('A long title', 300, 355);

	pointerAt(control, 'pointerdown', { clientX: 200 });
	pointerAt(control, 'pointermove', { clientX: 198 });
	expect(control.matches('[data-sonic-dragging]')).toBe(false);

	pointerAt(control, 'pointermove', { clientX: 190 });
	pointerAt(control, 'pointermove', { clientX: 170 });
	expect(control.matches('[data-sonic-dragging]')).toBe(true);
	expect(tape.style.translate).toBe('-20px');
	expect(control.dataset.sonicClipped).toBe('start end');

	pointerAt(control, 'pointermove', { clientX: 300 });
	expect(tape.style.translate).toBe('');
	expect(control.dataset.sonicClipped).toBe('end');

	pointerAt(control, 'pointermove', { clientX: 0 });
	expect(tape.style.translate).toBe('-55px');

	pointerAt(control, 'pointerup', { clientX: 0 });
	expect(control.matches('[data-sonic-dragging]')).toBe(false);
	expect(legs.at(-1)).toEqual({ delay: 2000, duration: 1375, translate: ['-55px', '0px'] });
});

test('strayed across the line past the zone, a cancellable drag puts the tape back, and resumes when the pointer returns', async () => {
	document.head.innerHTML = '<style>.sonic-ticker { --_sonic-ticker-cancel-zone: 30px; }</style>';

	const { legs } = fakeLegs();
	const { control, tape, ticker } = await mountTicker('A long title', 300, 355);

	vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 300, 20));
	ticker.cancellable = true;

	pointerAt(control, 'pointerdown', { clientX: 200, clientY: 110 });
	pointerAt(control, 'pointermove', { clientX: 190, clientY: 110 });
	pointerAt(control, 'pointermove', { clientX: 170, clientY: 150 });
	expect(tape.style.translate).toBe('-20px');
	expect(control.matches('[data-sonic-cancelling]')).toBe(false);

	pointerAt(control, 'pointermove', { clientX: 165, clientY: 151 });
	expect(tape.style.translate).toBe('');
	expect(control.matches('[data-sonic-cancelling][data-sonic-dragging]')).toBe(true);

	pointerAt(control, 'pointermove', { clientX: 160, clientY: 69 });
	expect(tape.style.translate).toBe('');

	pointerAt(control, 'pointermove', { clientX: 160, clientY: 70 });
	expect(tape.style.translate).toBe('-30px');
	expect(control.matches('[data-sonic-cancelling]')).toBe(false);

	pointerAt(control, 'pointermove', { clientX: 150, clientY: 200 });
	pointerAt(control, 'pointerup', { clientX: 150, clientY: 200 });
	expect(control.matches('[data-sonic-cancelling], [data-sonic-dragging]')).toBe(false);
	expect(legs.at(-1)).toEqual({ delay: 2000, duration: 1375, translate: ['0px', '-55px'] });
});

test('a drag that is not cancellable follows the pointer however far it strays', async () => {
	fakeLegs();

	const { control, tape } = await mountTicker('A long title', 300, 355);

	pointerAt(control, 'pointerdown', { clientX: 200, clientY: 10 });
	pointerAt(control, 'pointermove', { clientX: 190, clientY: 10 });
	pointerAt(control, 'pointermove', { clientX: 170, clientY: 400 });

	expect(tape.style.translate).toBe('-20px');
	expect(control.matches('[data-sonic-cancelling]')).toBe(false);
});

test('the one click after a drag is cancelled and goes no further, and a plain press keeps its click', async () => {
	fakeLegs();

	const { control, tape } = await mountTicker('A <a href="/release/">link</a>', 300, 355);
	const link = tape.querySelector('a');
	const heard: Array<boolean> = [];
	const click = (): MouseEvent => {
		const event = new MouseEvent('click', { bubbles: true, cancelable: true });

		link?.dispatchEvent(event);

		return event;
	};

	document.body.addEventListener('click', (event) => {
		heard.push(event.defaultPrevented);
		event.preventDefault();
	});

	pointerAt(control, 'pointerdown', { clientX: 200 });
	pointerAt(control, 'pointermove', { clientX: 180 });
	pointerAt(control, 'pointerup', { clientX: 180 });
	expect(click().defaultPrevented).toBe(true);
	expect(heard).toEqual([]);

	click();
	pointerAt(control, 'pointerdown', { clientX: 200 });
	pointerAt(control, 'pointermove', { clientX: 198 });
	pointerAt(control, 'pointerup', { clientX: 198 });
	click();
	expect(heard).toEqual([false, false]);
});

test('a mouse that leaves before its press is a drag lets go, and the same one captured carries on', async () => {
	fakeLegs();

	const { control, tape } = await mountTicker('A long title', 300, 355);

	pointerAt(control, 'pointerdown', { clientX: 200, pointerId: 1 });
	pointerAt(control, 'pointerleave', { clientX: 199, pointerId: 1 });
	pointerAt(control, 'pointermove', { clientX: 150, pointerId: 1 });
	expect(control.matches('[data-sonic-dragging]')).toBe(false);

	vi.spyOn(control, 'hasPointerCapture').mockReturnValue(true);
	pointerAt(control, 'pointerdown', { clientX: 200, pointerId: 1 });
	pointerAt(control, 'pointermove', { clientX: 180, pointerId: 1 });
	pointerAt(control, 'pointerleave', { clientX: 170, pointerId: 1 });
	pointerAt(control, 'pointermove', { clientX: 160, pointerId: 1 });
	expect(tape.style.translate).toBe('-20px');
});

test('content that fits is not dragged', async () => {
	fakeLegs();

	const { control, tape } = await mountTicker('Short', 300, 180);

	pointerAt(control, 'pointerdown', { clientX: 200 });
	pointerAt(control, 'pointermove', { clientX: 150 });

	expect(control.matches('[data-sonic-dragging]')).toBe(false);
	expect(tape.style.translate).toBe('');
});

test('disabled mid-drag, the tape lets go back at the start with no leg and takes no press, and enabled it sets off after the hold', async () => {
	const { legs } = fakeLegs();
	const { control, tape, ticker } = await mountTicker('A long title', 300, 355);
	const before = legs.length;

	pointerAt(control, 'pointerdown', { clientX: 200 });
	pointerAt(control, 'pointermove', { clientX: 190 });
	pointerAt(control, 'pointermove', { clientX: 170 });
	expect(tape.style.translate).toBe('-20px');

	ticker.disabled = true;
	expect(control.matches('[data-sonic-dragging]')).toBe(false);
	expect(tape.style.translate).toBe('');
	expect(control.dataset.sonicClipped).toBe('end');

	pointerAt(control, 'pointermove', { clientX: 150 });
	pointerAt(control, 'pointerup', { clientX: 150 });
	pointerAt(control, 'pointerdown', { clientX: 200 });
	pointerAt(control, 'pointermove', { clientX: 150 });
	expect(control.matches('[data-sonic-dragging]')).toBe(false);
	expect(tape.style.translate).toBe('');
	expect(legs).toHaveLength(before);

	pointerAt(control, 'pointerup', { clientX: 150 });
	ticker.disabled = false;
	expect(legs.at(-1)).toEqual({ delay: 2000, duration: 1375, translate: ['0px', '-55px'] });
});

test('a ticker disabled from the start runs no leg', async () => {
	const { legs } = fakeLegs();

	Object.assign(widths, { box: 300, tape: 355 });
	document.body.innerHTML = '<sonic-ticker disabled>A long title</sonic-ticker>';
	await nextTask();

	expect(document.querySelector('.sonic-ticker')?.matches('[data-sonic-overflowing]')).toBe(true);
	expect(legs).toEqual([]);
});

test('text replaces every child, keeps the control and reads back', async () => {
	const { control, tape, ticker } = await mountTicker(
		'Title, <a href="/release/">a link</a>',
		300,
		180,
	);

	expect(ticker.text).toBe('Title, a link');

	ticker.text = 'Next';
	await nextTask();

	expect([...ticker.childNodes].map((child) => child.textContent)).toEqual(['Next', 'Next']);
	expect(ticker.lastChild).toBe(control);
	expect(tape.getHTML()).toBe('Next');
	expect(ticker.text).toBe('Next');

	ticker.text = '';
	await nextTask();

	expect([...ticker.childNodes]).toEqual([control]);
	expect(tape.childNodes).toHaveLength(0);
});

test('a link is copied into the tape with its address', async () => {
	const { tape, ticker } = await mountTicker(
		'Title, <a href="/release/">a link</a> and 🎛',
		300,
		180,
	);

	expect(tape.querySelector('a')?.getAttribute('href')).toBe('/release/');
	expect(tape.textContent).toBe('Title, a link and 🎛');
	expect(ticker.querySelectorAll(':scope > a')).toHaveLength(1);
});

test('paused is a state on the control, from the attribute or the property', () => {
	Object.assign(widths, { box: 300, tape: 180 });
	document.body.innerHTML = '<sonic-ticker paused>Title</sonic-ticker>';

	const ticker = document.querySelector('sonic-ticker');
	const control = ticker?.querySelector<HTMLElement>('.sonic-ticker');
	if (!ticker || !control) throw new Error('The ticker did not render');

	expect(control.matches('[data-sonic-paused]')).toBe(true);

	ticker.paused = false;
	expect(control.matches('[data-sonic-paused]')).toBe(false);
	expect(ticker.hasAttribute('paused')).toBe(false);
});

test('focus leaving the tape scrolls the box back, and focus moving within it does not', async () => {
	const { control, tape } = await mountTicker(
		'<a href="/a/">First</a> and <a href="/b/">second</a>',
		300,
		600,
	);
	const [first, second] = tape.querySelectorAll('a');
	if (!first || !second) throw new Error('The links were not copied');

	control.scrollLeft = 240;
	second.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: first }));
	expect(control.scrollLeft).toBe(240);

	first.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
	expect(control.scrollLeft).toBe(0);
});
