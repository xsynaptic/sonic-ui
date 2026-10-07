import type { Locator } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { boxOf, centerOf, drag, mouseOnly } from './pointer.ts';
import { readState, valueNow } from './state.ts';

test.skip(({ isMobile }) => isMobile, mouseOnly);

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
});

test('a 32px drag moves a dial by a fifth of its 160px travel, dragging only while held', async ({
	page,
}) => {
	const host = page.locator('#level');
	const start = await centerOf(host.locator('.sonic-dial'));

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x, start.y - 32, { steps: 4 });
	expect(await readState(host, 'dragging')).toBe(true);

	await page.mouse.up();
	expect(await readState(host, 'dragging')).toBe(false);
	await expect(host.getByRole('slider')).toHaveAttribute('aria-valuenow', '70');
});

test('a dial travel in rem resolves to px', async ({ page }) => {
	const host = page.locator('#level');

	await host.evaluate((element) => {
		element.style.setProperty('--sonic-dial-travel', '5rem');
	});
	await drag(page, host.locator('.sonic-dial'), { x: 0, y: -32 });

	await expect(host.getByRole('slider')).toHaveAttribute('aria-valuenow', '90');
});

test('a single drag or press moves a slider by its groove or its cap, a number box over its travel and a dial through its detent', async ({
	page,
}) => {
	await test.step('a groove press jumps the slider to the pointer', async () => {
		const groove = await boxOf(page.locator('#send .sonic-slider'));
		const cap = await boxOf(page.locator('#send .sonic-slider-cap'));

		const travel = groove.width - cap.width;

		await page.mouse.click(groove.x + cap.width / 2 + travel * 0.75, groove.y + groove.height / 2);

		// Firefox and WebKit round the pointer to whole pixels
		const slider = page.getByRole('slider', { name: 'Send' });

		await expect.poll(async () => Math.abs((await valueNow(slider)) - 75)).toBeLessThanOrEqual(1);
	});

	await test.step('groove-press="none" moves the crossfader only by its cap', async () => {
		const slider = page.getByRole('slider', { name: 'Crossfade' });
		const groove = await boxOf(page.locator('#crossfader .sonic-slider'));
		const cap = await boxOf(page.locator('#crossfader .sonic-slider-cap'));

		await page.mouse.click(groove.x + groove.width - 4, groove.y + groove.height / 2);
		await expect.soft(slider).toHaveAttribute('aria-valuenow', '20');

		await drag(page, page.locator('#crossfader .sonic-slider-cap'), {
			x: (groove.width - cap.width) / 4,
			y: 0,
		});
		await expect.soft(slider).toHaveAttribute('aria-valuenow', '45');
	});

	await test.step('a vertical fader drags upward from its cap', async () => {
		const groove = await boxOf(page.locator('#fader .sonic-slider'));
		const cap = await boxOf(page.locator('#fader .sonic-slider-cap'));

		await drag(page, page.locator('#fader .sonic-slider-cap'), {
			x: 0,
			y: -(groove.height - cap.height) / 4,
		});

		const slider = page.getByRole('slider', { name: 'Fader' });

		await expect.soft(slider).toHaveAttribute('aria-orientation', 'vertical');
		await expect.poll(async () => Math.abs((await valueNow(slider)) - 25)).toBeLessThanOrEqual(1);
	});

	await test.step('a number box drags up over its 160px travel', async () => {
		await drag(page, page.locator('#tempo .sonic-number'), { x: 0, y: -32 });

		await expect
			.soft(page.getByRole('spinbutton', { name: 'Tempo' }))
			.toHaveAttribute('aria-valuenow', '176');
	});

	// 36 units over 160px: the detent at 0 sits 13px up from -3 and holds for 8px past it
	await test.step('a detent holds a drag that crosses it, then lets it go past the zone', async () => {
		const slider = page.getByRole('slider', { name: 'Low' });
		const dial = page.locator('#eq .sonic-dial');

		await drag(page, dial, { x: 0, y: -18 });
		await expect.soft(slider).toHaveAttribute('aria-valuenow', '0');

		await page.locator('#eq').evaluate((host) => {
			host.setAttribute('value', '-3');
		});
		await drag(page, dial, { x: 0, y: -30 });
		await expect.soft(slider).toHaveAttribute('aria-valuenow', '2');
	});
});

test('Cmd-click on an Apple platform, or Ctrl-click elsewhere, resets to the default', async ({
	page,
}) => {
	// `ControlOrMeta` follows the host; the control follows the page's `navigator.platform`
	const isApple = await page.evaluate(() => /^(Mac|iP)/.test(navigator.platform));
	const [reset, other] = isApple ? (['Meta', 'Control'] as const) : (['Control', 'Meta'] as const);
	const dial = page.locator('#level .sonic-dial');
	const level = page.getByRole('slider', { name: 'Level' });
	const before = await level.getAttribute('aria-valuenow');

	await dial.click({ modifiers: [other] });
	await expect(level).toHaveAttribute('aria-valuenow', before ?? '');

	await dial.click({ modifiers: [reset] });
	await expect(level).toHaveAttribute('aria-valuenow', '20');
});

test('a double press opens typed entry and Enter commits it', async ({ page }) => {
	await page.locator('#cutoff .sonic-dial').dblclick();

	const entry = page.getByRole('textbox', { name: 'Cutoff' });

	await expect(entry).toBeFocused();
	await expect(entry).toHaveValue('1.00 kHz');
	expect(await readState(page.locator('#cutoff'), 'editing')).toBe(true);
	await expect(page.locator('#cutoff .sonic-dial-readout')).toHaveCSS('cursor', 'text');
	await entry.fill('2k');
	await entry.press('Enter');
	expect(await readState(page.locator('#cutoff'), 'editing')).toBe(false);

	const slider = page.getByRole('slider', { name: 'Cutoff' });

	await expect(slider).toBeFocused();
	await expect(slider).toHaveAttribute('aria-valuenow', '2000');
	await expect(slider).toHaveAttribute('aria-valuetext', '2.00 kHz');
});

test('a double press on a number box types in place, with no bubble', async ({ page }) => {
	const control = page.locator('#tempo .sonic-number');
	const before = await control.boundingBox();

	await control.dblclick();

	const entry = page.getByRole('textbox', { name: 'Tempo' });
	const field = await entry.boundingBox();

	await expect(entry).toBeFocused();
	await expect(page.locator('#tempo [popover]')).toHaveCount(0);
	expect(await control.boundingBox()).toEqual(before);
	if (!before || !field) throw new Error('The number box has no box');
	expect(field.x).toBeGreaterThanOrEqual(before.x);
	expect(field.x + field.width).toBeLessThanOrEqual(before.x + before.width);

	await expect(page.locator('#tempo .sonic-number-value')).toHaveCSS('visibility', 'hidden');
	await entry.fill('98');
	await entry.press('Enter');
	await expect(page.locator('#tempo .sonic-number-value')).toHaveCSS('visibility', 'visible');

	const spinbutton = page.getByRole('spinbutton', { name: 'Tempo' });

	await expect(spinbutton).toBeFocused();
	await expect(spinbutton).toHaveAttribute('aria-valuenow', '98');
});

test('a segmented press dragged off latches nothing, and dragged to another option latches it and carries the focus the group held', async ({
	page,
}) => {
	const lowPass = page.getByRole('radio', { name: 'LP' });
	const highPass = page.getByRole('radio', { name: 'HP' });
	const start = await centerOf(lowPass);
	const end = await centerOf(highPass);

	await drag(page, highPass, { x: 0, y: 200 });
	await expect(lowPass).toBeChecked();

	await lowPass.focus();
	await drag(page, lowPass, { x: end.x - start.x, y: end.y - start.y });

	await expect(highPass).toBeChecked();
	await expect(highPass).toBeFocused();
});

function readSpring(host: Locator): Promise<{ drawn: number; isSpringing: boolean }> {
	return host.evaluate((element) => {
		const control = element.querySelector('.sonic-slider');
		const drawn = control
			? getComputedStyle(control).getPropertyValue('--_sonic-slider-value')
			: '';

		return { drawn: Number(drawn), isSpringing: element.matches(':state(springing)') };
	});
}

test('a springing slider let go reports where it was, then its return to the origin, landing its value at once while the cap glides back', async ({
	page,
}) => {
	const host = page.locator('#bend');
	const slider = page.getByRole('slider', { name: 'Bend' });
	const start = await centerOf(host.locator('.sonic-slider-cap'));

	await page.addStyleTag({
		content: '#bend:state(springing) > .sonic-slider { transition-duration: 2s; }',
	});
	await host.evaluate((element) => {
		element.addEventListener('change', () => {
			const now = element.querySelector('[role="slider"]')?.getAttribute('aria-valuenow') ?? '';

			element.dataset.changed = `${element.dataset.changed ?? ''} ${now}`.trim();
		});
	});

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + 30, start.y, { steps: 4 });
	expect(await readState(host, 'at-origin')).toBe(false);

	await page.mouse.up();

	const gliding = await readSpring(host);

	await expect(slider).toHaveAttribute('aria-valuenow', '0');
	expect(await readState(host, 'at-origin')).toBe(true);
	expect(gliding.isSpringing).toBe(true);
	expect(gliding.drawn).toBeGreaterThan(0.5);

	const [released, returned] = ((await host.getAttribute('data-changed')) ?? '')
		.split(' ')
		.map(Number);

	expect(released).toBeGreaterThan(0);
	expect(returned).toBe(0);

	await expect.poll(() => readSpring(host)).toEqual({ drawn: 0.5, isSpringing: false });
});

test('under reduced motion, a springing slider draws its return at once', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });

	const host = page.locator('#bend');

	await drag(page, page.locator('#bend .sonic-slider-cap'), { x: 30, y: 0 });

	const { drawn } = await readSpring(host);

	expect(drawn).toBe(0.5);
});
