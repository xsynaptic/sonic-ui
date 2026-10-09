import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import {
	alphaAt,
	canvasPixels,
	expectPixel,
	middleOf,
	paintedColour,
	pixelAt,
} from './canvas-probe.ts';

type Pixel = [number, number, number, number];
import { drag, mouseOnly } from './pointer.ts';
import { readState } from './state.ts';

test.use({ deviceScaleFactor: 2 });

async function openWaveform(page: Page): Promise<{ canvas: Locator; waveform: Locator }> {
	await page.goto('/fixtures/');

	const waveform = page.locator('#waveform');
	const canvas = waveform.locator('canvas');

	// Out of view it holds its frames, and on a phone the fixture sits below the fold
	await canvas.scrollIntoViewIfNeeded();
	await expect.poll(async () => alphaAt(canvas, await middleOf(canvas))).toBe(255);

	return { canvas, waveform };
}

async function upperRow(canvas: Locator): Promise<string> {
	const width = await canvas.evaluate((element) =>
		element instanceof HTMLCanvasElement ? element.width : 0,
	);
	const columns = Array.from({ length: Math.floor(width / 2) }, (_column, index) => index * 2);

	return String(await canvasPixels(canvas, columns, 0.3));
}

function readPlayhead(waveform: Locator): Promise<string> {
	return waveform
		.locator('.sonic-waveform-playhead')
		.evaluate((line) => getComputedStyle(line).translate);
}

test("the wave's center paints the lit colour", { tag: '@mobile' }, async ({ page }) => {
	const { canvas } = await openWaveform(page);
	const lit = await canvas.evaluate((element) =>
		getComputedStyle(element).getPropertyValue('--_sonic-lit'),
	);

	expectPixel(await pixelAt(canvas, await middleOf(canvas)), await paintedColour(canvas, lit));
});

// Full-scale peaks, so every row but the margins is wave; band 1 to 148.5 seconds, nothing to 149.5, band 2 after
async function tintWaveform(waveform: Locator): Promise<void> {
	await waveform.evaluate((host: HTMLElementTagNameMap['sonic-waveform']) => {
		const levels = new Uint8Array(3000 * 2);

		for (let bandFrame = 0; bandFrame < 3000; bandFrame += 1) {
			if (bandFrame < 1485) levels[bandFrame * 2] = 200;
			if (bandFrame >= 1495) levels[bandFrame * 2 + 1] = 90;
		}
		host.style.setProperty('--sonic-waveform-band-1', 'rgb(255 0 0)');
		host.style.setProperty('--sonic-waveform-band-2', 'oklch(0.6 0.2 260)');
		host.style.setProperty('--sonic-waveform-edge-shade', 'initial');
		host.peaks = {
			pairsPerSecond: 10,
			samples: Int8Array.from({ length: 6000 }, (_sample, index) => (index % 2 ? 127 : -128)),
		};
		host.bands = { bandCount: 2, framesPerSecond: 10, levels, minDecibels: -48 };
	});
}

// The fixture draws 70 px a second around 150 seconds
function columnAt(canvas: Locator, seconds: number): Promise<number> {
	return canvas.evaluate(
		(element, at) =>
			element instanceof HTMLCanvasElement
				? Math.round(element.width / 2 + (at - 150) * 70 * (element.width / element.clientWidth))
				: 0,
		seconds,
	);
}

function layered(
	canvas: Locator,
	layers: Array<[colour: string, opacity: number]>,
): Promise<Pixel> {
	return canvas.evaluate((element, fills) => {
		const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
		if (!context) throw new Error('No 2d context');

		for (const [colour, opacity] of fills) {
			const styles = getComputedStyle(element);

			context.globalAlpha = opacity;
			context.fillStyle = colour.startsWith('--') ? styles.getPropertyValue(colour) : colour;
			context.fillRect(0, 0, 1, 1);
		}

		const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;

		return [red, green, blue, alpha] satisfies [number, number, number, number];
	}, layers);
}

test(
	"a band paints its token's colour, and a stretch with no band data paints the wave colour",
	{ tag: '@mobile' },
	async ({ page }) => {
		const { canvas, waveform } = await openWaveform(page);

		await tintWaveform(waveform);

		const columns = await Promise.all(
			[148.2, 149, 150].map((seconds) => columnAt(canvas, seconds)),
		);

		await expect(async () => {
			const [low, bare, high] = await canvasPixels(canvas, columns);

			expectPixel(low, await layered(canvas, [['rgb(255 0 0)', 1]]));
			expectPixel(bare, await layered(canvas, [['--_sonic-waveform-wave', 1]]));
			// Hue only: the strongest channel of the token's colour goes to full
			expect(high?.[2]).toBe(255);
			expect(high?.[0]).toBeLessThan(high?.[1] ?? 0);
		}).toPass();
	},
);

test(
	'a dimmed waveform lays its bands over the dimmed wave at three quarters, times the opacity token',
	{ tag: '@mobile' },
	async ({ page }) => {
		const { canvas, waveform } = await openWaveform(page);

		await tintWaveform(waveform);

		const column = await columnAt(canvas, 148.2);
		const lit = await pixelAt(canvas, await columnAt(canvas, 149));

		await waveform.evaluate((host) => {
			host.setAttribute('dimmed', '');
			host.style.setProperty('--sonic-waveform-band-opacity', '0.8');
		});
		await expect(async () => {
			const wave = await layered(canvas, [['--_sonic-waveform-wave', 1]]);

			expect(wave).not.toEqual(lit);
			expectPixel(
				await pixelAt(canvas, column),
				await layered(canvas, [
					['--_sonic-waveform-wave', 1],
					['rgb(255 0 0)', 0.6],
				]),
			);
		}).toPass();
	},
);

test(
	'normalize 0 keeps a band at its own colour, and the token repaints with no repaint()',
	{ tag: '@mobile' },
	async ({ page }) => {
		const { canvas, waveform } = await openWaveform(page);

		await tintWaveform(waveform);

		const column = await columnAt(canvas, 150);

		await expect(async () => {
			const scaled = await pixelAt(canvas, column);

			expect(scaled?.[2]).toBe(255);
		}).toPass();
		await waveform.evaluate((host) => {
			host.style.setProperty('--sonic-waveform-band-normalize', '0');
		});
		await expect(async () => {
			expectPixel(
				await pixelAt(canvas, column),
				await layered(canvas, [['oklch(0.6 0.2 260)', 1]]),
			);
		}).toPass();
	},
);

test(
	'with no edge shade the wave is one colour from top to center, and a shade darkens a tinted top by its row',
	{ tag: '@mobile' },
	async ({ page }) => {
		const { canvas, waveform } = await openWaveform(page);

		await tintWaveform(waveform);

		const column = await columnAt(canvas, 148.2);
		const red = await layered(canvas, [['rgb(255 0 0)', 1]]);

		await expect(async () => {
			const [top] = await canvasPixels(canvas, [column], 0.1);

			expectPixel(top, red);
		}).toPass();

		await waveform.evaluate((host) => {
			host.style.setProperty('--sonic-waveform-edge-shade', '0.5');
		});

		const depth = await canvas.evaluate((element) => {
			if (!(element instanceof HTMLCanvasElement)) return 0;

			return Math.abs(1 - (2 * (Math.floor(element.height * 0.1) + 0.5)) / element.height);
		});

		await expect(async () => {
			const [top] = await canvasPixels(canvas, [column], 0.1);

			expectPixel(
				top,
				await layered(canvas, [
					['rgb(255 0 0)', 1],
					['--_sonic-waveform-shade', 0.5 * depth],
				]),
			);
			expectPixel(await pixelAt(canvas, column), red);
		}).toPass();
	},
);

test('a drag right walks back and seeks once', async ({ isMobile, page }) => {
	test.skip(isMobile, mouseOnly);

	const { canvas, waveform } = await openWaveform(page);

	await waveform.evaluate((element) => {
		element.addEventListener('change', () => {
			element.dataset.changes = String(Number(element.dataset.changes ?? 0) + 1);
		});
	});

	await drag(page, canvas, { x: 140, y: 0 });

	const { changes, value } = await waveform.evaluate((element) => ({
		changes: element.dataset.changes,
		value: Number(Reflect.get(element, 'value')),
	}));

	expect(value).toBeCloseTo(148, 5);
	expect(changes).toBe('1');
});

// A page from 146.2 seconds is almost four long, so a few hundred ms of play stays on it
test('an inert waveform takes no focus or drag and still scrolls while playing', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const { canvas, waveform } = await openWaveform(page);
	const control = waveform.locator('.sonic-waveform');

	await waveform.evaluate((element) => {
		const startMs = performance.now();

		Object.assign(element, {
			inert: true,
			playing: true,
			readTime: () => 147 + (performance.now() - startMs) / 1000,
		});
	});
	await control.evaluate((element) => {
		if (element instanceof HTMLElement) element.focus();
	});
	await expect(control).not.toBeFocused();

	await drag(page, canvas, { x: 140, y: 0 });
	expect(await waveform.evaluate((element) => Number(Reflect.get(element, 'value')))).toBe(150);

	const before = await upperRow(canvas);

	await expect.poll(() => upperRow(canvas)).not.toBe(before);
});

test(
	'under reduced motion the picture holds still while the playhead crosses it',
	{ tag: '@mobile' },
	async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });

		const { canvas, waveform } = await openWaveform(page);

		await waveform.evaluate((element) => {
			const startMs = performance.now();

			Object.assign(element, {
				playing: true,
				readTime: () => 147 + (performance.now() - startMs) / 1000,
				value: 147,
			});
		});

		let before = await upperRow(canvas);

		await expect
			.poll(async () => {
				const previous = before;

				before = await upperRow(canvas);

				return before === previous;
			})
			.toBe(true);

		const playheadBefore = await readPlayhead(waveform);

		await expect.poll(() => readPlayhead(waveform)).not.toBe(playheadBefore);
		expect(await upperRow(canvas)).toBe(before);
	},
);

test(
	'clientXOf lands on the playhead, in a paged window too',
	{ tag: '@mobile' },
	async ({ page }) => {
		const { waveform } = await openWaveform(page);
		const gap = (): Promise<number> =>
			waveform.evaluate((element) => {
				const playhead = element.querySelector('.sonic-waveform-playhead');
				if (!playhead || !('clientXOf' in element) || !('value' in element)) return NaN;

				const box = playhead.getBoundingClientRect();
				const { clientXOf } = element as { clientXOf: (value: unknown) => number };

				return Math.abs(clientXOf.call(element, element.value) - (box.left + box.width / 2));
			});

		await waveform.evaluate((element) => Object.assign(element, { value: 147 }));
		await expect.poll(gap).toBeLessThan(0.5);

		await page.emulateMedia({ reducedMotion: 'reduce' });
		await waveform.evaluate((element) => Object.assign(element, { value: 149 }));
		await expect.poll(gap).toBeLessThan(0.5);
	},
);

test('the pending state follows a region in the window, clears when it lands or leaves, and waits out pending-delay', async ({
	page,
}) => {
	const { waveform } = await openWaveform(page);
	const setPending = async (pending: Array<[number, number]>): Promise<void> => {
		await waveform.evaluate((element, regions) => {
			Object.assign(element, { pending: regions });
		}, pending);
	};
	const readPending = (): Promise<boolean> => readState(waveform, 'pending');

	await setPending([[149, 151]]);
	await expect.poll(readPending).toBe(true);

	await setPending([]);
	await expect.poll(readPending).toBe(false);

	await setPending([[250, 260]]);
	await expect.poll(readPending).toBe(false);

	await waveform.evaluate((element) => {
		element.setAttribute('pending-delay', '300');
		Object.assign(element, { pending: [[149, 152]] });
	});
	expect(await readPending()).toBe(false);
	await expect.poll(readPending).toBe(true);
});

test('a host tabindex of -1 leaves the tab order, and a press still focuses the waveform', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, 'A phone has no Tab key');

	const { canvas, waveform } = await openWaveform(page);
	const holdsFocus = (): Promise<boolean> =>
		waveform.evaluate((host) => host.contains(document.activeElement));

	await canvas.click();
	expect(await holdsFocus()).toBe(true);

	// WebKit walks back from the pressed canvas, and the stop before it is the control it sits in
	await page.keyboard.press('Tab');
	expect(await holdsFocus()).toBe(false);
	await page.keyboard.press('Shift+Tab');
	expect(await holdsFocus()).toBe(true);

	await waveform.evaluate((host) => {
		host.setAttribute('tabindex', '-1');
	});
	await page.keyboard.press('Tab');
	await page.keyboard.press('Shift+Tab');
	expect(await holdsFocus()).toBe(false);

	await canvas.click();
	expect(await holdsFocus()).toBe(true);
});

test(
	'a label takes its tokens, sits on a scrim, is drawn by renderLabel and fades for a crossed marker',
	{ tag: '@mobile' },
	async ({ page }) => {
		await page.goto('/fixtures/');

		await test.step('the playhead, ghost, label, readout and touch tokens each land on their own part, and the parked label keeps its insets from the wave', async () => {
			const waveform = page.locator('#waveform-tokens');
			const playhead = waveform.locator('.sonic-waveform-playhead');
			const label = waveform.locator('.sonic-waveform-label').first();

			await waveform.locator('canvas').scrollIntoViewIfNeeded();
			await expect.soft(playhead).toHaveCSS('inline-size', '1px');
			await expect.soft(playhead).toHaveCSS('background-color', 'rgb(255, 0, 0)');
			await expect
				.soft(waveform.locator('.sonic-waveform-ghost'))
				.toHaveCSS('background-color', 'rgb(7, 8, 9)');
			await expect.soft(label).toHaveText('Intro');
			await expect.soft(label).toHaveCSS('color', 'rgb(240, 241, 242)');
			await expect.soft(label).toHaveCSS('background-color', 'rgb(4, 5, 6)');
			await expect.soft(label).toHaveCSS('font-family', 'monospace');
			await expect.soft(label).toHaveCSS('font-size', '14px');
			await expect.soft(label).toHaveCSS('line-height', '21px');
			await expect
				.soft(waveform.locator('.sonic-waveform-readout'))
				.toHaveCSS('color', 'rgb(1, 2, 3)');
			await expect.soft(waveform.locator('.sonic-waveform')).toHaveCSS('touch-action', 'none');

			const inline = await waveform.evaluate((host) => {
				const wave = host.querySelector('canvas')?.getBoundingClientRect();
				const parked = host.querySelector('.sonic-waveform-label');
				if (!wave || !parked) throw new Error('The waveform drew no label');

				const text = document.createRange();

				text.selectNodeContents(parked);

				return text.getBoundingClientRect().left - wave.left;
			});

			expect.soft(inline).toBeCloseTo(16, 1);
			// 6rem of size: the label's 0.04 inset, untouched by the inline token
			// Firefox lays out in sixtieths of a pixel and reports 3.83333px
			const lift = await label.evaluate((parked) => getComputedStyle(parked).bottom);

			expect.soft(Number(lift.replace('px', ''))).toBeCloseTo(3.84, 1);
		});

		await test.step('a scrim spans the wave under the label, and a block inset lifts the label', async () => {
			const waveform = page.locator('#waveform-pinned');
			const scrim = waveform.locator('.sonic-waveform-scrim');
			const label = waveform.locator('.sonic-waveform-label').first();

			await waveform.locator('canvas').scrollIntoViewIfNeeded();
			await expect.soft(label).toHaveText('Intro');
			await expect.soft(scrim).toHaveCSS('background-image', /rgb\(13, 14, 15\)/);

			const boxes = await waveform.evaluate((host) =>
				[...host.querySelectorAll('canvas, .sonic-waveform-scrim')].map((part) => {
					const { height, width, x, y } = part.getBoundingClientRect();

					return [x, y, width, height];
				}),
			);

			expect.soft(boxes[1]).toEqual(boxes[0]);
			await expect.soft(label).toHaveCSS('bottom', '14px');
		});

		await test.step('a label is drawn by renderLabel from the marker and its own keys, and goes back to the text without it', async () => {
			const waveform = page.locator('#waveform-pinned');
			const label = waveform.locator('.sonic-waveform-label').first();

			await waveform.locator('canvas').scrollIntoViewIfNeeded();
			await expect.soft(label).toHaveText('Intro');
			await waveform.evaluate((host: HTMLElementTagNameMap['sonic-waveform']) => {
				host.markers = [{ label: 'Spoken', start: 100, title: 'Opening' }];
				host.renderLabel = (marker, element) => {
					const title = document.createElement('b');

					title.textContent = String(marker.title);
					element.append(`${String(marker.start)} `, title);
				};
			});

			await expect.soft(label).toHaveText('100 Opening');
			await expect.soft(label.locator('b')).toHaveText('Opening');
			await expect.soft(label).toHaveAttribute('aria-hidden', 'true');

			await waveform.evaluate((host: HTMLElementTagNameMap['sonic-waveform']) => {
				host.renderLabel = undefined;
			});
			await expect.soft(label).toHaveText('Spoken');
		});

		await test.step('the fade tokens set where the parked label gives way to a marker the playhead has crossed', async () => {
			const waveform = page.locator('#waveform-pinned');
			const parked = waveform.locator('.sonic-waveform-label').first();
			const mark = (fadeEnd: string): Promise<void> =>
				waveform.evaluate((host: HTMLElementTagNameMap['sonic-waveform'], end) => {
					host.style.setProperty('--sonic-waveform-label-fade-end', end);
					host.markers = [
						{ label: 'Before', start: 100 },
						{ label: 'Crossed', start: 149.5 },
					];
				}, fadeEnd);

			await waveform.locator('canvas').scrollIntoViewIfNeeded();
			await mark('1');
			await expect.soft(parked).toHaveText('Before');
			await expect
				.poll(() => parked.evaluate((label) => Number(getComputedStyle(label).opacity)))
				.toBeLessThan(1);

			await mark('0');
			await expect.soft(parked).toHaveText('Crossed');
			await expect.soft(parked).toHaveCSS('opacity', '1');
		});
	},
);
