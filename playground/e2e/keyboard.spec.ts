import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { clear, systemColour } from './colour.ts';
import { centerOf, noForcedColours } from './pointer.ts';
import { stillTransitions } from './state.ts';

function recordNotes(page: Page): Promise<void> {
	return page.evaluate(() => {
		const notes: Array<string> = [];

		Object.assign(window, { notes });
		for (const type of ['sonic-noteon', 'sonic-noteoff'] as const) {
			document.addEventListener(type, (event: Event) => {
				const detail: unknown = event instanceof CustomEvent ? event.detail : undefined;
				if (typeof detail !== 'object' || detail === null || !('note' in detail)) return;

				notes.push(`${type.slice(10)} ${String(detail.note)}`);
			});
		}
	});
}

function notesHeard(page: Page): Promise<Array<string>> {
	return page.evaluate(() => ('notes' in window ? (window.notes as Array<string>) : []));
}

const clearStop = /(rgba\(0, 0, 0, 0\)|\/ 0\))\)$/;

function frontOf(key: Locator): Promise<number> {
	return key.evaluate((element) => {
		const cap = element.querySelector('.sonic-keyboard-cap');

		return cap ? Number(getComputedStyle(cap, '::before').bottom.replace(/px$/, '')) : NaN;
	});
}

function forcedPaint(
	target: Locator,
): Promise<{ dot: string; outline: string; outlineColour: string; top: string }> {
	return target.evaluate((element) => {
		const cap = element.querySelector('.sonic-keyboard-cap');
		const style = getComputedStyle(element);
		const top = cap ? getComputedStyle(cap, '::before') : undefined;

		return {
			dot: top?.backgroundImage.split(/,(?![^(]*\))/, 3)[1]?.trim() ?? '',
			outline: style.outlineStyle,
			outlineColour: style.outlineColor,
			top: top?.backgroundColor ?? '',
		};
	});
}

test.describe('touch', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'Two touches need CDP');
	test.use({ hasTouch: true, viewport: { height: 500, width: 500 } });

	test(
		'two fingers hold two keys, and a drag on the keys never scrolls',
		{ tag: '@mobile' },
		async ({ page }) => {
			await page.goto('/fixtures/');
			await page.locator('#keyboard').scrollIntoViewIfNeeded();
			await recordNotes(page);

			const session = await page.context().newCDPSession(page);
			const c = await centerOf(page.locator('#keyboard [data-sonic-note="48"]'));
			const e = await centerOf(page.locator('#keyboard [data-sonic-note="52"]'));
			const low = { x: c.x, y: c.y + 30 };
			const high = { x: e.x, y: e.y + 30 };

			await session.send('Input.dispatchTouchEvent', { touchPoints: [low], type: 'touchStart' });
			await session.send('Input.dispatchTouchEvent', {
				touchPoints: [low, high],
				type: 'touchStart',
			});
			await expect(page.locator('#keyboard [data-sonic-pressed]')).toHaveCount(2);
			await session.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' });

			await expect.poll(() => notesHeard(page)).toEqual(['on 48', 'on 52', 'off 48', 'off 52']);

			const scrolled = await page.evaluate(() => window.scrollY);

			await session.send('Input.dispatchTouchEvent', { touchPoints: [low], type: 'touchStart' });
			for (let move = 1; move <= 10; move += 1) {
				await session.send('Input.dispatchTouchEvent', {
					touchPoints: [{ x: low.x + move, y: low.y - 15 * move }],
					type: 'touchMove',
				});
			}
			await session.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' });

			expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
		},
	);
});

test('Tab reaches the keys once, on the lowest C, and leaves', async ({ page }) => {
	await page.goto('/fixtures/');
	await page.locator('#keyboard').evaluate((keyboard) => {
		keyboard.insertAdjacentHTML('beforebegin', '<input aria-label="Before" id="before">');
		keyboard.insertAdjacentHTML('afterend', '<input aria-label="After" id="after">');
	});
	await page.locator('#before').focus();
	await page.keyboard.press('Tab');

	await expect(page.locator('#keyboard [data-sonic-note="48"]')).toBeFocused();

	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Tab');

	await expect(page.locator('#after')).toBeFocused();

	await page.keyboard.press('Shift+Tab');

	await expect(page.locator('#keyboard [data-sonic-note="49"]')).toBeFocused();
});

test('a press slides the top over the front on a modelled skin, and moves nothing at relief 0', async ({
	page,
}) => {
	await page.goto('/fixtures/no-skin/');
	await stillTransitions(page);

	for (const [group, isModelled] of [
		['amber', true],
		['flat', false],
	] as const) {
		const key = page.locator(`#${group}-keyboard [data-sonic-note="62"]`);
		const rest = await frontOf(key);
		const box = await key.boundingBox();
		if (!box) throw new Error('The key has no box');

		await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.9);
		await page.mouse.down();
		const pressed = await frontOf(key);

		await page.mouse.up();

		if (isModelled) {
			expect.soft(rest, group).toBeGreaterThan(0);
			expect.soft(pressed, group).toBeLessThan(rest);
			expect.soft(pressed, group).toBeGreaterThan(0);
		} else {
			expect.soft([rest, pressed], group).toEqual([0, 0]);
		}
	}
});

test('with no skin a white key is an edge with no fill, and a pressed one fills', async ({
	page,
}) => {
	await page.goto('/fixtures/no-skin/');
	await stillTransitions(page);

	const key = page.locator('#bare-keyboard [data-sonic-note="64"]');
	const paint = (): Promise<{ edge: string; fill: string; text: string }> =>
		key.evaluate((element) => {
			const cap = element.querySelector('.sonic-keyboard-cap');
			if (!cap) throw new Error('The key has no cap');

			const top = getComputedStyle(cap, '::before');

			return {
				edge: top.boxShadow.split(/,(?![^(]*\))/, 1)[0]?.trim() ?? '',
				fill:
					top.backgroundImage
						.split(/,(?![^(]*\))/)
						.at(-1)
						?.trim() ?? '',
				text: getComputedStyle(element).color,
			};
		});

	const rest = await paint();

	expect(rest.edge).toContain(rest.text);
	expect(rest.fill).toMatch(clearStop);

	const box = await key.boundingBox();
	if (!box) throw new Error('The key has no box');

	await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.9);
	await page.mouse.down();

	const pressed = await paint();

	await page.mouse.up();

	expect(pressed.fill).not.toMatch(clearStop);
});

test('forced colours outline only the focused key, and a pressed lit key keeps its dot', async ({
	browserName,
	page,
}) => {
	test.skip(browserName === 'webkit', noForcedColours);

	await page.emulateMedia({ forcedColors: 'active' });
	await page.goto('/fixtures/');

	const key = page.locator('#keyboard [data-sonic-note="52"]');

	await key.focus();
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowLeft');
	await page.keyboard.down(' ');

	const pressed = await forcedPaint(key);
	const resting = await forcedPaint(page.locator('#keyboard [data-sonic-note="55"]'));

	await page.keyboard.up(' ');

	expect(pressed.outline).toBe('solid');
	expect(pressed.outlineColour).not.toMatch(clear);
	expect(pressed.top).toBe(await systemColour(page, 'Highlight'));
	expect(pressed.dot).toContain(await systemColour(page, 'HighlightText'));
	expect(resting.outline).toBe('none');
});

test('Space and Enter each play one note, and a click from script plays a short one', async ({
	page,
}) => {
	await page.goto('/fixtures/');
	await recordNotes(page);

	const key = page.locator('#keyboard [data-sonic-note="50"]');

	await key.focus();
	await page.keyboard.down(' ');
	await page.keyboard.up(' ');
	await page.keyboard.down('Enter');
	await page.keyboard.up('Enter');

	expect(await notesHeard(page)).toEqual(['on 50', 'off 50', 'on 50', 'off 50']);

	await page.locator('#keyboard [data-sonic-note="52"]').evaluate((element) => {
		if (element instanceof HTMLElement) element.click();
	});

	await expect
		.poll(() => notesHeard(page))
		.toEqual(['on 50', 'off 50', 'on 50', 'off 50', 'on 52', 'off 52']);
});

test('a disabled fieldset silences the keys and lets go of a held one', async ({ page }) => {
	await page.goto('/fixtures/');
	await page.locator('#keyboard').evaluate((keyboard) => {
		const fieldset = document.createElement('fieldset');

		fieldset.id = 'keys-fieldset';
		keyboard.before(fieldset);
		fieldset.append(keyboard);
	});
	await recordNotes(page);

	const key = page.locator('#keyboard [data-sonic-note="50"]');

	await key.focus();
	await page.keyboard.down(' ');
	await page.locator('#keys-fieldset').evaluate((fieldset) => {
		fieldset.toggleAttribute('disabled', true);
	});
	await page.keyboard.up(' ');

	const box = await key.boundingBox();
	if (!box) throw new Error('The key has no box');

	await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.9);

	expect(await notesHeard(page)).toEqual(['on 50', 'off 50']);
});

test('the keys keep piano order and arrow directions under a right-to-left page', async ({
	page,
}) => {
	await page.goto('/fixtures/');
	await page.locator('#keyboard').evaluate((keyboard) => {
		keyboard.setAttribute('dir', 'rtl');
	});

	const low = await centerOf(page.locator('#keyboard [data-sonic-note="48"]'));
	const high = await centerOf(page.locator('#keyboard [data-sonic-note="59"]'));

	expect(low.x).toBeLessThan(high.x);

	await page.locator('#keyboard [data-sonic-note="48"]').focus();
	await page.keyboard.press('ArrowRight');

	await expect(page.locator('#keyboard [data-sonic-note="49"]')).toBeFocused();
});

test('putting the keyboard straight back mid-press lets go, and the next press plays', async ({
	page,
}) => {
	await page.goto('/fixtures/');
	await recordNotes(page);

	const reinsert = (): Promise<void> =>
		page.locator('#keyboard').evaluate((keyboard) => {
			keyboard.parentElement?.append(keyboard);
		});

	await page.locator('#keyboard [data-sonic-note="50"]').focus();
	await page.keyboard.down(' ');
	await reinsert();
	await page.keyboard.up(' ');
	await page.locator('#keyboard [data-sonic-note="52"]').focus();
	await page.keyboard.down(' ');
	await page.keyboard.up(' ');

	const pointed = await centerOf(page.locator('#keyboard [data-sonic-note="48"]'));

	await page.mouse.move(pointed.x, pointed.y + 30);
	await page.mouse.down();
	await reinsert();
	await page.mouse.move(pointed.x, pointed.y + 400);
	await page.mouse.up();

	expect(await notesHeard(page)).toEqual(['on 50', 'off 50', 'on 52', 'off 52', 'on 48', 'off 48']);
});
