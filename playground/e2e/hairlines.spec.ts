import { expect, test } from '@playwright/test';

import { paintedLine, paintedRuns } from './paint-probe.ts';

test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no device scale factor');

// Each control at the smallest size a specimen gives it, where a ratio of the size falls under a pixel
const smallest = `
	#xy { --sonic-xy-size: 4.5rem; }
	#envelope { --sonic-envelope-size: 4.5rem; }
	#waveform { --sonic-waveform-size: 2rem; }
`;

const ticked = `
	<sonic-dial aria-label="Small dial" id="small-dial" max="10" min="0" style="--sonic-dial-size: 2rem" value="5">
		<span data-sonic-value="0"></span><span data-sonic-value="10"></span>
	</sonic-dial>
	<sonic-slider aria-label="Small slider" id="small-slider" max="10" min="0" style="--sonic-slider-size: 1rem" value="5">
		<span data-sonic-value="0"></span>
	</sonic-slider>
	<sonic-slider aria-label="Small fader" id="small-fader" max="10" min="0" orientation="vertical" style="--sonic-slider-size: 1rem" value="5">
		<span data-sonic-value="0"></span>
	</sonic-slider>
`;

const lines = [
	{ property: 'width', selector: '#small-dial .sonic-scale-tick' },
	{ property: 'width', selector: '#small-slider .sonic-scale-tick' },
	{ property: 'height', selector: '#small-fader .sonic-scale-tick' },
	{ property: 'border-top-width', pseudo: '::before', selector: '#xy .sonic-xy-puck' },
	{ property: 'border-top-width', selector: '#xy .sonic-xy-reticle' },
	{ property: 'border-top-width', selector: '#envelope .sonic-envelope-handle' },
	{ property: 'border-top-width', selector: '#wavestrip-region .sonic-region-bracket' },
	{ property: 'border-left-width', selector: '#wavestrip .sonic-wavestrip-region' },
	{ property: 'width', selector: '#waveform .sonic-waveform-playhead' },
] as const;

for (const deviceScaleFactor of [1, 1.25, 1.5, 1.75, 2, 3]) {
	test.describe(`at ${String(deviceScaleFactor)}dppx`, () => {
		test.use({ deviceScaleFactor });

		test('every drawn line of a small control is a whole number of device pixels, at least one', async ({
			browserName,
			page,
		}) => {
			test.skip(
				browserName === 'chromium' && !Number.isSafeInteger(deviceScaleFactor),
				'Chromium emulates the scale',
			);

			await page.goto('/fixtures/');
			await page.addStyleTag({ content: smallest });
			await page.evaluate((markup) => {
				document.body.insertAdjacentHTML('beforeend', `<div>${markup}</div>`);
			}, ticked);

			const widths = await page.evaluate((parts) => {
				return parts.map(({ property, selector, ...part }) => {
					const found = document.querySelector(selector);
					if (!found) return { selector, width: NaN };

					const pseudo = 'pseudo' in part ? part.pseudo : undefined;
					const width = Number(
						getComputedStyle(found, pseudo).getPropertyValue(property).replace(/px$/, ''),
					);

					return { selector, width: width * window.devicePixelRatio };
				});
			}, lines);

			for (const { selector, width } of widths) {
				expect.soft(width, selector).toBeGreaterThanOrEqual(1);
				expect.soft(width / Math.round(width), selector).toBeLessThanOrEqual(1 + 2 / 64);
			}
		});

		test('every tick of a slider off the pixel grid paints at full strength, never as two faint pixels', async ({
			browserName,
			page,
		}) => {
			test.skip(browserName === 'chromium' && deviceScaleFactor > 1, 'Chromium emulates the scale');

			await page.goto('/fixtures/');

			const marks = Array.from(
				{ length: 11 },
				(_mark, index) => `<span data-sonic-value="${String(index * 0.7)}"></span>`,
			).join('');

			await page.evaluate((markup) => {
				document.body.insertAdjacentHTML(
					'afterbegin',
					`<div id="off-grid" style="background: #000; padding: 0.3px 0 0 13.3px">${markup}</div>`,
				);
			}, `<sonic-slider aria-label="Off grid" max="7" min="0" style="--sonic-slider-size: 1.25rem; --sonic-slider-length: 13.1rem" value="3">${marks}</sonic-slider>`);

			const scale = page.locator('#off-grid .sonic-slider-scale');
			const across = await scale.evaluate((element) => {
				const band = element.getBoundingClientRect();
				const tick = element.querySelector('.sonic-scale-tick')?.getBoundingClientRect();
				if (!tick) return NaN;

				return (tick.top + tick.height / 2 - band.top) / band.height;
			});
			const hairline = await scale.evaluate((element) => {
				const tick = element.querySelector('.sonic-scale-tick');

				return tick ? tick.getBoundingClientRect().width * window.devicePixelRatio : NaN;
			});
			const runs = paintedRuns(
				await paintedLine(scale, 'x', across),
				([red, green, blue]) => red + green + blue > 6,
			).map(([from, to]) => Math.round((to - from) * deviceScaleFactor));

			expect(runs).toHaveLength(11);

			for (const run of runs) {
				expect.soft(run).toBeGreaterThanOrEqual(Math.floor(hairline));
				expect.soft(run).toBeLessThanOrEqual(Math.ceil(hairline));
			}
		});
	});
}
