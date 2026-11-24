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

// Full-scale peaks fill every row but the margins, and half-scale RMS draws a body across about the middle half
async function fillWaveform(waveform: Locator, rmsSeconds = 0): Promise<void> {
	await waveform.evaluate((host: HTMLElementTagNameMap['sonic-waveform'], pairs) => {
		host.style.setProperty('--sonic-waveform-edge-shade', 'initial');
		host.peaks = {
			pairsPerSecond: 10,
			...(pairs > 0 ? { rms: new Int8Array(pairs).fill(64) } : {}),
			samples: Int8Array.from({ length: 6000 }, (_sample, index) => (index % 2 ? 127 : -128)),
		};
	}, rmsSeconds * 10);
}

// These stay inside sRGB at every step toward either test surface, so the browser's conversion and the control's agree
const bassStop = 'oklch(0.6 0.08 30)';
const highsStop = 'oklch(0.62 0.08 250)';

// The share of the way from a colour's lightness to the surface's that the peaks zone moves
function towardSurface(colour: string, [depth, surface]: [number, number]): string {
	return `oklch(from ${colour} calc(l + ${String(depth)} * (${String(surface)} - l)) c h)`;
}

// The bass leads until 148.5 seconds, both bands are silent until 149.5, and the highs lead after that
async function tintWaveform(waveform: Locator, rmsSeconds = 0): Promise<void> {
	await fillWaveform(waveform, rmsSeconds);
	await waveform.evaluate(
		(host: HTMLElementTagNameMap['sonic-waveform'], [bass, highs]) => {
			const levels = new Uint8Array(3000 * 2);

			for (let bandFrame = 0; bandFrame < 3000; bandFrame += 1) {
				if (bandFrame < 1485) levels[bandFrame * 2] = 250;
				if (bandFrame >= 1495) levels[bandFrame * 2 + 1] = 250;
			}
			host.style.setProperty('--sonic-waveform-tint-1', bass);
			host.style.setProperty('--sonic-waveform-tint-2', highs);
			host.bands = {
				bandCount: 2,
				framesPerSecond: 10,
				levels,
				medians: [120, 120],
				minDecibels: -48,
			};
			host.tintHue = 'spectral';
		},
		[bassStop, highsStop] as const,
	);
}

function columnPixels(
	canvas: Locator,
	column: number,
	rows: [number, number],
): Promise<Array<Array<number>>> {
	return canvas.evaluate(
		(element, [x, [fromShare, toShare]]) => {
			if (!(element instanceof HTMLCanvasElement)) return [];

			const from = Math.round(element.height * fromShare);
			const to = Math.round(element.height * toShare);
			const data = element.getContext('2d')?.getImageData(x, from, 1, to - from).data;

			return Array.from({ length: to - from }, (_row, index) => [
				...(data?.subarray(index * 4, index * 4 + 3) ?? []),
			]);
		},
		[column, rows] as const,
	);
}

function expectBetween(pixel: Array<number>, [first, second]: [Pixel, Pixel]): void {
	for (const channel of [0, 1, 2]) {
		const [low = 0, high = 255] = [first, second]
			.map((colour) => colour[channel] ?? 0)
			.toSorted((one, other) => one - other);

		expect(pixel[channel]).toBeGreaterThanOrEqual(low - 2);
		expect(pixel[channel]).toBeLessThanOrEqual(high + 2);
	}
}

const bodyRow = 0.5;
const peaksRow = 0.15;

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
	'the wave paints the lit colour, and a tint paints each band where it leads, repaints on its medians and steps, and shades a tinted top by its row',
	{ tag: '@mobile' },
	async ({ page }) => {
		const { canvas, waveform } = await openWaveform(page);

		await test.step("the wave's center paints the lit colour", async () => {
			const lit = await canvas.evaluate((element) =>
				getComputedStyle(element).getPropertyValue('--_sonic-lit'),
			);

			expectPixel(await pixelAt(canvas, await middleOf(canvas)), await paintedColour(canvas, lit));
		});

		await test.step('spectral balance paints the bass end where the bass leads and the highs end where the highs lead, opaque', async () => {
			await tintWaveform(waveform);

			const columns = await Promise.all([148.2, 150].map((seconds) => columnAt(canvas, seconds)));

			await expect(async () => {
				const [bass, highs] = await canvasPixels(canvas, columns);

				expectPixel(bass, await layered(canvas, [[bassStop, 1]]));
				expectPixel(highs, await layered(canvas, [[highsStop, 1]]));
			}).toPass();
		});

		await test.step('a tint with no medians draws untinted, and draws once they arrive', async () => {
			await tintWaveform(waveform);
			await waveform.evaluate((host: HTMLElementTagNameMap['sonic-waveform']) => {
				const { bands } = host;
				if (!bands) throw new Error('No bands');

				host.bands = { ...bands, medians: [] };
			});

			const column = await columnAt(canvas, 148.2);

			await expect(async () => {
				expectPixel(
					await pixelAt(canvas, column),
					await layered(canvas, [['--_sonic-waveform-base', 1]]),
				);
			}).toPass();
			await waveform.evaluate((host: HTMLElementTagNameMap['sonic-waveform']) => {
				const { bands } = host;
				if (!bands) throw new Error('No bands');

				host.bands = { ...bands, medians: [120, 120] };
			});
			await expect(async () => {
				expectPixel(await pixelAt(canvas, column), await layered(canvas, [[bassStop, 1]]));
			}).toPass();
		});

		await test.step('with no edge shade the wave is one colour from top to center, and a shade darkens a tinted top by its row', async () => {
			await tintWaveform(waveform);

			const column = await columnAt(canvas, 148.2);
			const bass = await layered(canvas, [[bassStop, 1]]);

			await expect(async () => {
				const [top] = await canvasPixels(canvas, [column], 0.1);

				expectPixel(top, bass);
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
						[bassStop, 1],
						['--_sonic-waveform-shade', 0.5 * depth],
					]),
				);
				expectPixel(await pixelAt(canvas, column), bass);
			}).toPass();
		});

		await test.step('steps repaint with no repaint(): balanced silence moves from the middle of the palette to its end', async () => {
			await tintWaveform(waveform);

			const column = await columnAt(canvas, 149);
			const highs = await layered(canvas, [[highsStop, 1]]);

			await expect(async () => {
				const middle = await pixelAt(canvas, column);

				expect(middle?.[3]).toBe(255);
				expect(middle).not.toEqual(highs);
			}).toPass();
			await waveform.evaluate((host) => {
				host.style.setProperty('--sonic-waveform-tint-steps', '2');
			});
			await expect(async () => {
				expectPixel(await pixelAt(canvas, column), highs);
			}).toPass();
		});
	},
);

test(
	'with RMS the body paints the base colour and the zone out to the peaks the peaks colour, moved part of the way to the surface, with no rim where they meet',
	{ tag: '@mobile' },
	async ({ page }) => {
		const { canvas, waveform } = await openWaveform(page);

		await test.step('where the body reaches the peaks, or there is no RMS, the wave edge is the base colour with no rim', async () => {
			// The wave's top edge falls a quarter of the way into a pixel row, leaving that pixel three quarters covered
			const edgeRow = 0.2;

			await waveform.evaluate((host: HTMLElementTagNameMap['sonic-waveform'], rowFraction) => {
				const canvasElement = host.querySelector('canvas');
				if (!canvasElement) throw new Error('No canvas');

				const center = canvasElement.height / 2;
				const edge = Math.floor(canvasElement.height * rowFraction) + 0.25;
				const amplitude = (center - edge) / (0.94 * center);

				host.style.setProperty('--sonic-waveform-edge-shade', 'initial');
				host.peaks = {
					pairsPerSecond: 10,
					rms: new Float32Array(1490).fill(amplitude),
					samples: Float32Array.from({ length: 6000 }, (_sample, index) =>
						index % 2 ? amplitude : -amplitude,
					),
				};
			}, edgeRow);

			const columns = [await columnAt(canvas, 148.2), await columnAt(canvas, 150)];

			await expect(async () => {
				const base = await layered(canvas, [['--_sonic-waveform-base', 1]]);

				const edges = await canvasPixels(canvas, columns, edgeRow);

				for (const pixel of edges) {
					expect(pixel[3]).toBeGreaterThan(0);
					expect(pixel[3]).toBeLessThan(255);
					for (const channel of [0, 1, 2]) {
						expect(Math.abs((pixel[channel] ?? 0) - (base[channel] ?? 0))).toBeLessThanOrEqual(3);
					}
				}
			}).toPass();
		});

		await test.step('with RMS the body paints the base colour and the zone out to the peaks the peaks colour, until the RMS ends', async () => {
			await fillWaveform(waveform, 149);

			const withRms = await columnAt(canvas, 148.2);
			const pastRms = await columnAt(canvas, 150);

			await expect(async () => {
				const [base, peaks] = await Promise.all([
					layered(canvas, [['--_sonic-waveform-base', 1]]),
					layered(canvas, [['--_sonic-waveform-peaks', 1]]),
				]);
				const [body] = await canvasPixels(canvas, [withRms], bodyRow);
				const [around, bare] = await canvasPixels(canvas, [withRms, pastRms], peaksRow);

				expect(peaks).not.toEqual(base);
				expectPixel(body, base);
				expectPixel(around, peaks);
				expectPixel(bare, base);
			}).toPass();
		});

		await test.step('the peaks zone moves part of the way to the surface, dark or light, and its depth repaints with no repaint()', async () => {
			await tintWaveform(waveform, 300);

			const column = await columnAt(canvas, 148.2);
			const zones = (): Promise<Array<Pixel>> =>
				Promise.all(
					[bodyRow, peaksRow].map(async (row) => {
						const [pixel] = await canvasPixels(canvas, [column], row);

						return pixel ?? [0, 0, 0, 0];
					}),
				);
			const bass = await layered(canvas, [[bassStop, 1]]);

			await waveform.evaluate((host: HTMLElementTagNameMap['sonic-waveform']) => {
				host.style.setProperty('--sonic-unlit', 'oklch(0.3 0 0)');
				host.repaint();
			});
			await expect(async () => {
				const [body, around] = await zones();

				expectPixel(body, bass);
				expectPixel(around, await layered(canvas, [[towardSurface(bassStop, [0.6, 0.3]), 1]]));
			}).toPass();
			await waveform.evaluate((host: HTMLElementTagNameMap['sonic-waveform']) => {
				host.style.setProperty('--sonic-unlit', 'oklch(0.97 0 0)');
				host.repaint();
			});
			await expect(async () => {
				const [, around] = await zones();

				expectPixel(around, await layered(canvas, [[towardSurface(bassStop, [0.6, 0.97]), 1]]));
			}).toPass();

			await test.step('across the clipped body edge every pixel is a blend of the two zones, with no seam of a third colour', async () => {
				const [body = [0, 0, 0, 0], around = [0, 0, 0, 0]] = await zones();
				const rows = await columnPixels(canvas, column, [0.15, 0.5]);

				expect(rows.length).toBeGreaterThan(4);
				for (const pixel of rows) expectBetween(pixel, [body, around]);
			});
			await waveform.evaluate((host) => {
				host.style.setProperty('--sonic-waveform-peaks-depth', 'calc(0.5 / 2)');
			});
			await expect(async () => {
				const [body, around] = await zones();

				expectPixel(body, bass);
				expectPixel(around, await layered(canvas, [[towardSurface(bassStop, [0.25, 0.97]), 1]]));
			}).toPass();
		});
	},
);

test(
	"dimmed and disabled each draw untinted and flat, hold a consumer's tokens, and a token written for the state wins there",
	{ tag: '@mobile' },
	async ({ page }) => {
		const { canvas, waveform } = await openWaveform(page);

		for (const [state, selector] of [
			['dimmed', '[dimmed]'],
			['disabled', ':disabled'],
		] as const) {
			await test.step(`${state} draws untinted and flat, holds a consumer's tokens, and a token written for ${state} wins there`, async () => {
				await tintWaveform(waveform, 300);

				const column = await columnAt(canvas, 148.2);
				const zones = async (): Promise<Array<Pixel | undefined>> => [
					...(await canvasPixels(canvas, [column], bodyRow)),
					...(await canvasPixels(canvas, [column], peaksRow)),
				];

				await waveform.evaluate((host, attribute) => {
					host.setAttribute(attribute, '');
				}, state);
				const untinted = await columnAt(canvas, 149);

				await expect(async () => {
					const [body, around] = await zones();
					const [flat] = await canvasPixels(canvas, [untinted], bodyRow);

					expect(flat?.[3]).toBe(255);
					expectPixel(body, flat ?? [0, 0, 0, 0]);
					expectPixel(around, flat ?? [0, 0, 0, 0]);
				}).toPass();

				const tokens = await page.addStyleTag({
					content: [
						'#waveform { --sonic-waveform-base: rgb(255 255 0); --sonic-waveform-peaks: rgb(0 0 255) }',
						`#waveform${selector} { --sonic-waveform-peaks: rgb(0 128 0) }`,
					].join('\n'),
				});

				await expect(async () => {
					const [body, around] = await zones();

					expectPixel(body, await layered(canvas, [['rgb(255 255 0)', 1]]));
					expectPixel(around, await layered(canvas, [['rgb(0 128 0)', 1]]));
				}).toPass();
				await tokens.evaluate((sheet) => {
					if (sheet instanceof Element) sheet.remove();
				});
				await waveform.evaluate((host, attribute) => {
					host.removeAttribute(attribute);
				}, state);
			});
		}
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
