import { expect, test, vi } from 'vitest';

import type { RiderLabel, RiderView } from '#lib/marker-rider.ts';

import { createLabelRider, layoutRider } from '#lib/marker-rider.ts';

const view: RiderView = {
	insetPx: 8,
	playheadSeconds: 20,
	startSeconds: 0,
	widthPx: 400,
	windowSeconds: 40,
};

const early: RiderView = { ...view, playheadSeconds: 5 };

function labels(...starts: Array<[number, number]>): Array<RiderLabel> {
	return starts.map(([start, widthPx]) => ({
		isDimmed: false,
		start,
		text: `At ${String(start)}`,
		widthPx,
	}));
}

test('the parked label is the last marker at or before the playhead; none parks before the first', () => {
	const markers = labels([5, 40], [20, 40], [30, 40]);

	expect(layoutRider(markers, view).parked?.index).toBe(1);
	expect(layoutRider(markers, view).arriving?.index).toBe(2);
	expect(layoutRider(markers, { ...view, playheadSeconds: 4 }).parked).toBeUndefined();
	expect(layoutRider(markers, { ...view, playheadSeconds: 4 }).arriving?.index).toBe(0);
});

test('the arriving label follows its line at fractional x across a third of a pixel', () => {
	const markers = labels([10, 40], [30.5, 40]);
	const before = layoutRider(markers, view).arriving?.x ?? NaN;
	const after = layoutRider(markers, { ...view, startSeconds: 1 / 30 }).arriving?.x ?? NaN;

	expect(before).toBeCloseTo(313);
	expect(before - after).toBeCloseTo(1 / 3);
});

test('the clip starts when the arriving label meets the parked label, not its line', () => {
	const wholeAt = layoutRider(labels([1, 100], [11, 30]), early).parked;
	const cutAt = layoutRider(labels([1, 100], [10.9, 30]), early).parked;

	expect(wholeAt?.shownPx).toBe(100);
	expect(cutAt?.shownPx).toBeCloseTo(99);
});

test('the parked label fades as the next line closes on the playhead', () => {
	const markers = labels([5, 40], [30, 40]);

	expect(layoutRider(markers, view).parked?.opacity).toBe(1);
	expect(layoutRider(markers, { ...view, playheadSeconds: 25 }).parked?.opacity).toBeCloseTo(0.5);
	expect(layoutRider(markers, { ...view, playheadSeconds: 29.9 }).parked?.opacity).toBeCloseTo(
		0.01,
	);
});

test('the far edge cuts a label, and one starting past it does not arrive', () => {
	expect(layoutRider(labels([5, 40], [38, 40]), view).arriving?.shownPx).toBe(12);
	expect(layoutRider(labels([5, 40], [39.5, 40]), view).arriving).toBeUndefined();
	expect(layoutRider(labels([38, 40]), { ...view, playheadSeconds: 39 }).parked?.shownPx).toBe(12);
});

function mountRider(): {
	arriving: HTMLElement;
	control: HTMLElement;
	parked: HTMLElement;
	rider: ReturnType<typeof createLabelRider>;
} {
	const control = document.createElement('div');

	control.innerHTML = '<div class="sonic-test-label"></div><div class="sonic-test-label"></div>';
	vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
		new DOMRect(0, 0, 100, 10),
	);

	const rider = createLabelRider(control, {
		className: 'sonic-test-label',
		colourProperty: '--_sonic-test-marker',
		insetProperty: '--_sonic-test-inset',
	});

	rider.measure([
		{ isDimmed: false, start: 1, text: 'Intro' },
		{ isDimmed: true, start: 10.9, text: 'Drop' },
	]);

	const [parked, arriving] = control.querySelectorAll<HTMLElement>('.sonic-test-label');
	if (!parked || !arriving) throw new Error('The control holds no label slots');

	return { arriving, control, parked, rider };
}

function shown(label: HTMLElement): Array<boolean | string> {
	return [label.hidden, label.textContent, label.style.translate];
}

test('a placed label carries its text, its place and its cut, and hides when nothing parks', () => {
	const { arriving, control, parked, rider } = mountRider();

	rider.place(early);

	expect(shown(parked)).toEqual([false, 'Intro', '10.00px']);
	expect(parked.style.getPropertyValue('clip-path')).toContain('99.00px');
	expect('sonicDimmed' in parked.dataset).toBe(false);
	expect(shown(arriving)).toEqual([false, 'Drop', '109.00px']);
	expect('sonicDimmed' in arriving.dataset).toBe(true);
	expect(control.querySelectorAll('.sonic-test-label')).toHaveLength(2);

	rider.place({ ...early, playheadSeconds: 0.5 });

	expect(parked.hidden).toBe(true);
});

test('placing the same window twice writes nothing the second time', () => {
	const { control, rider } = mountRider();
	const records: Array<MutationRecord> = [];
	const observer = new MutationObserver((batch) => {
		records.push(...batch);
	});

	rider.place(early);
	observer.observe(control, {
		attributes: true,
		characterData: true,
		childList: true,
		subtree: true,
	});
	rider.place(early);
	records.push(...observer.takeRecords());

	expect(control.firstElementChild?.getAttribute('style')).toContain('clip-path');
	expect(records).toEqual([]);
});

test.each([
	{ windowSeconds: 0 },
	{ windowSeconds: -40 },
	{ windowSeconds: NaN },
	{ widthPx: 0 },
	{ widthPx: -400 },
	{ widthPx: Infinity },
])('a window of %o lays out nothing', (bad) => {
	expect(layoutRider(labels([5, 40], [30, 40]), { ...view, ...bad })).toEqual({});
});

test('labels measured out of order park and arrive in order of time', () => {
	const { arriving, control, parked, rider } = mountRider();

	rider.measure([
		{ isDimmed: true, start: 10.9, text: 'Drop' },
		{ isDimmed: false, start: 1, text: 'Intro' },
	]);
	rider.place(early);

	expect([parked.textContent, arriving.textContent]).toEqual(['Intro', 'Drop']);
	expect(control.querySelectorAll('.sonic-test-label')).toHaveLength(2);
});

test('a parked label fades by the written opacity, and clears it once whole again', () => {
	const { parked, rider } = mountRider();

	rider.place(early);
	expect(parked.style.opacity).toBe('0.590');

	rider.place({ ...early, playheadSeconds: 1.9 });
	expect(parked.style.opacity).toBe('0.900');

	rider.measure([{ isDimmed: false, start: 1, text: 'Intro' }]);
	rider.place(early);
	expect(parked.style.opacity).toBe('');
});

test('a label with no room left in the window is hidden, not drawn at no width', () => {
	const { arriving, parked, rider } = mountRider();

	rider.place({ ...early, startSeconds: -50 });

	expect(parked.hidden).toBe(true);
	expect(arriving.hidden).toBe(true);
});

test('a label slot taken over by a marker with no kind drops the kind', () => {
	const { parked, rider } = mountRider();

	rider.measure([{ isDimmed: false, kind: 'loop', start: 1, text: 'Loop' }]);
	rider.place(early);
	expect(parked.style.getPropertyValue('--_sonic-marker')).toContain('--sonic-marker-loop');

	rider.measure([{ isDimmed: false, start: 1, text: 'Intro' }]);
	rider.place(early);
	expect(parked.style.getPropertyValue('--_sonic-marker')).toBe('');
});
