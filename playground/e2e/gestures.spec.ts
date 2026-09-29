import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

interface Point {
	x: number;
	y: number;
}

test.skip(({ isMobile }) => isMobile, 'Touch has its own spec');

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/');
});

async function centreOf(target: Locator): Promise<Point> {
	const box = await target.boundingBox();
	if (!box) throw new Error('The target has no box');

	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page: Page, target: Locator, by: Point): Promise<void> {
	const start = await centreOf(target);

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + by.x, start.y + by.y, { steps: 4 });
	await page.mouse.up();
}

function readDragging(host: Locator): Promise<boolean> {
	return host.evaluate((element) => element.matches(':state(dragging)'));
}

test('a 32px drag moves a dial by a fifth of its 160px travel, dragging only while held', async ({
	page,
}) => {
	const host = page.locator('#level');
	const start = await centreOf(host.locator('.sonic-dial'));

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x, start.y - 32, { steps: 4 });
	expect(await readDragging(host)).toBe(true);

	await page.mouse.up();
	expect(await readDragging(host)).toBe(false);
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

test('Shift drags at a tenth of the pace', async ({ page }) => {
	await page.keyboard.down('Shift');
	await drag(page, page.locator('#level .sonic-dial'), { x: 0, y: -32 });
	await page.keyboard.up('Shift');

	await expect(page.getByRole('slider', { name: 'Level' })).toHaveAttribute('aria-valuenow', '52');
});

test('a groove press jumps the slider to the pointer', async ({ page }) => {
	const track = await page.locator('#send .sonic-slider').boundingBox();
	const cap = await page.locator('#send .sonic-slider-cap').boundingBox();
	if (!track || !cap) throw new Error('The slider has no box');

	const travel = track.width - cap.width;

	await page.mouse.click(track.x + cap.width / 2 + travel * 0.75, track.y + track.height / 2);

	// Firefox and WebKit round the pointer to whole pixels
	const slider = page.getByRole('slider', { name: 'Send' });

	await expect
		.poll(async () => Math.abs(Number(await slider.getAttribute('aria-valuenow')) - 75))
		.toBeLessThanOrEqual(1);
});

test('groove-press="none" moves the crossfader only by its cap', async ({ page }) => {
	const slider = page.getByRole('slider', { name: 'Crossfade' });
	const track = await page.locator('#crossfader .sonic-slider').boundingBox();
	const cap = await page.locator('#crossfader .sonic-slider-cap').boundingBox();
	if (!track || !cap) throw new Error('The slider has no box');

	await page.mouse.click(track.x + track.width - 4, track.y + track.height / 2);
	await expect(slider).toHaveAttribute('aria-valuenow', '20');

	await drag(page, page.locator('#crossfader .sonic-slider-cap'), {
		x: (track.width - cap.width) / 4,
		y: 0,
	});
	await expect(slider).toHaveAttribute('aria-valuenow', '45');
});

test('a vertical fader drags upward from its cap', async ({ page }) => {
	const track = await page.locator('#fader .sonic-slider').boundingBox();
	const cap = await page.locator('#fader .sonic-slider-cap').boundingBox();
	if (!track || !cap) throw new Error('The slider has no box');

	await drag(page, page.locator('#fader .sonic-slider-cap'), {
		x: 0,
		y: -(track.height - cap.height) / 4,
	});

	const slider = page.getByRole('slider', { name: 'Fader' });

	await expect(slider).toHaveAttribute('aria-orientation', 'vertical');
	await expect
		.poll(async () => Math.abs(Number(await slider.getAttribute('aria-valuenow')) - 25))
		.toBeLessThanOrEqual(1);
});

test('Cmd or Ctrl-click resets to the default', async ({ page }) => {
	await page.keyboard.down('ControlOrMeta');
	await page.locator('#level .sonic-dial').click();
	await page.keyboard.up('ControlOrMeta');

	await expect(page.getByRole('slider', { name: 'Level' })).toHaveAttribute('aria-valuenow', '20');
});

test('a disabled dial ignores drags and presses', async ({ page }) => {
	const control = page.locator('#locked .sonic-dial');
	const centre = await centreOf(control);

	await drag(page, control, { x: 0, y: -32 });
	// The locator's own `dblclick` waits for an enabled target
	await page.mouse.dblclick(centre.x, centre.y);

	await expect(control).toHaveAttribute('aria-valuenow', '30');
	await expect(page.getByRole('textbox')).toHaveCount(0);
});

test('a double press opens typed entry and Enter commits it', async ({ page }) => {
	await page.locator('#cutoff .sonic-dial').dblclick();

	const entry = page.getByRole('textbox', { name: 'Cutoff' });

	await expect(entry).toBeFocused();
	await expect(entry).toHaveValue('1.00 kHz');
	await entry.fill('2k');
	await entry.press('Enter');

	const slider = page.getByRole('slider', { name: 'Cutoff' });

	await expect(slider).toBeFocused();
	await expect(slider).toHaveAttribute('aria-valuenow', '2000');
	await expect(slider).toHaveAttribute('aria-valuetext', '2.00 kHz');
});

test('double-press="reset" resets rather than opening an entry', async ({ page }) => {
	await page.locator('#crossfader .sonic-slider-cap').dblclick();

	await expect(page.getByRole('slider', { name: 'Crossfade' })).toHaveAttribute(
		'aria-valuenow',
		'50',
	);
	await expect(page.getByRole('textbox')).toHaveCount(0);
});

test('Enter opens typed entry from the keyboard, and Escape leaves the value', async ({ page }) => {
	const slider = page.getByRole('slider', { name: 'Level' });

	await slider.focus();
	await page.keyboard.press('Enter');
	await page.keyboard.type('90');
	await page.keyboard.press('Escape');

	await expect(slider).toBeFocused();
	await expect(slider).toHaveAttribute('aria-valuenow', '50');
});

test('an endless dial dragged past its end wraps to the start', async ({ page }) => {
	await drag(page, page.locator('#phase .sonic-dial'), { x: 0, y: -16 });

	await expect(page.getByRole('slider', { name: 'Phase' })).toHaveAttribute('aria-valuenow', '25');
});

test('a number box drags up over its 160px travel', async ({ page }) => {
	await drag(page, page.locator('#tempo .sonic-number'), { x: 0, y: -32 });

	await expect(page.getByRole('spinbutton', { name: 'Tempo' })).toHaveAttribute(
		'aria-valuenow',
		'176',
	);
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

	await entry.fill('98');
	await entry.press('Enter');

	const spinbutton = page.getByRole('spinbutton', { name: 'Tempo' });

	await expect(spinbutton).toBeFocused();
	await expect(spinbutton).toHaveAttribute('aria-valuenow', '98');
});

test('a switch press dragged to another segment latches it, and dragged off latches nothing', async ({
	page,
}) => {
	const lowPass = page.getByRole('radio', { name: 'LP' });
	const highPass = page.getByRole('radio', { name: 'HP' });
	const start = await centreOf(lowPass);
	const end = await centreOf(highPass);
	const offset = { x: end.x - start.x, y: end.y - start.y };

	await drag(page, highPass, { x: 0, y: 200 });
	await expect(lowPass).toBeChecked();

	await drag(page, lowPass, offset);
	await expect(highPass).toBeChecked();
});
