import { expect, test } from 'vitest';

import '#define/dial.ts';
import '#define/slider.ts';

import { nextTask } from './helpers.ts';

async function mount(markup: string): Promise<HTMLElement> {
	document.body.innerHTML = markup;
	await nextTask();

	const host = document.body.firstElementChild;
	if (!(host instanceof HTMLElement)) throw new Error('Nothing rendered');

	return host;
}

function places(host: HTMLElement): Array<number> {
	return [
		...host.querySelectorAll<HTMLElement>(
			':scope > * > :is(.sonic-dial-scale, .sonic-slider-scale) > *',
		),
	].map((mark) => Number(mark.style.getPropertyValue('--_sonic-scale-at')));
}

test('a label sits where the taper puts its value', async () => {
	const skewed = await mount(
		'<sonic-dial max="2000" midpoint="200"><span data-sonic-value="200">200</span></sonic-dial>',
	);

	expect(places(skewed)).toEqual([0.5]);

	const log = await mount(
		'<sonic-dial min="20" max="20000" taper="log"><span data-sonic-value="632.4555">632</span></sonic-dial>',
	);

	expect(places(log)[0]).toBeCloseTo(0.5, 5);
});

test('labels on a value list sit by entry, interpolated between entries', async () => {
	const dial = await mount(
		'<sonic-dial values="1 2 4 8 16"><span data-sonic-value="4"></span><span data-sonic-value="3"></span></sonic-dial>',
	);

	expect(places(dial)).toEqual([0.5, 0.375]);
});

test('a range change moves the labels already placed', async () => {
	const dial = await mount('<sonic-dial max="10"><span data-sonic-value="5">5</span></sonic-dial>');

	dial.setAttribute('max', '20');

	expect(places(dial)).toEqual([0.25]);
});

test('a label appended, edited or removed later is mirrored', async () => {
	const dial = await mount('<sonic-dial min="-10" max="10"></sonic-dial>');
	const label = document.createElement('span');

	label.dataset.sonicValue = '5';
	label.textContent = '+5';
	dial.append(label);
	await nextTask();

	expect(places(dial)).toEqual([0.75]);

	label.textContent = 'Five';
	await nextTask();

	expect(dial.querySelector('.sonic-dial-scale')?.textContent).toBe('Five');

	label.remove();
	await nextTask();

	expect(places(dial)).toEqual([]);
});

test('only children with a value are taken into the scale; the rest still render', async () => {
	const dial = await mount(
		'<sonic-dial><span data-sonic-value="0">0</span><span data-sonic-value="">blank</span><em>beside</em></sonic-dial>',
	);
	const assigned = dial.shadowRoot?.querySelector('slot')?.assignedNodes() ?? [];

	expect(assigned.map((node) => node.nodeName)).toEqual(['EM', 'DIV']);
	expect(places(dial)).toEqual([0]);
});

test('a mark with nothing to print is a tick, and one holding an icon is a label', async () => {
	const dial = await mount(
		'<sonic-dial max="2"><span data-sonic-value="0"></span><span data-sonic-value="1">  </span><span data-sonic-value="2"><svg></svg></span></sonic-dial>',
	);
	const kinds = [...(dial.querySelector('.sonic-dial-scale')?.children ?? [])].map(
		(mark) => mark.className,
	);

	expect(kinds).toEqual(['sonic-scale-tick', 'sonic-scale-tick', 'sonic-scale-label']);
});

test('a slider places its labels along the travel by the same taper', async () => {
	const slider = await mount(
		'<sonic-slider min="-60" max="10" midpoint="-12" orientation="vertical"><span data-sonic-value="-12">−12</span><span data-sonic-value="10">+10</span></sonic-slider>',
	);

	expect(places(slider)).toEqual([0.5, 1]);
});
