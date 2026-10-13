import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import type { Point } from './pointer.ts';

import { boxOf, centerOf } from './pointer.ts';

const hold = 400;

const rate = 200;

interface Leg {
	delay: number;
	duration: number;
	state: string;
	translate: Array<string>;
}

interface Tape {
	clipped?: string;
	display: string;
	distance: number;
	isDragging: boolean;
	isOverflowing: boolean;
	leg?: Leg;
	mask: string;
	position: number;
}

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/ticker/');
	await expect(page.locator('#long .sonic-ticker')).toHaveAttribute('data-sonic-clipped', 'end');
});

function readTape(ticker: Locator): Promise<Tape> {
	return ticker.evaluate((host) => {
		const control = host.querySelector<HTMLElement>(':scope > .sonic-ticker');
		const tape = control?.querySelector<HTMLElement>('.sonic-ticker-tape');
		if (!control || !tape) throw new Error('The ticker did not render');

		const readLeg = (animation: Animation): Leg | undefined => {
			const { effect } = animation;
			if (!(effect instanceof KeyframeEffect)) return undefined;

			return {
				delay: Number(effect.getTiming().delay),
				duration: Number(effect.getTiming().duration),
				state: animation.playState,
				translate: effect.getKeyframes().map((keyframe) => String(keyframe.translate)),
			};
		};
		const styles = getComputedStyle(control);
		const { display, translate } = getComputedStyle(tape);
		const [leg] = tape.getAnimations().flatMap((animation) => readLeg(animation) ?? []);

		return {
			display,
			distance: Math.round(tape.offsetWidth - control.clientWidth),
			isDragging: Object.hasOwn(control.dataset, 'sonicDragging'),
			isOverflowing: Object.hasOwn(control.dataset, 'sonicOverflowing'),
			mask: styles.maskImage,
			position: 0 - new DOMMatrixReadOnly(translate === 'none' ? '' : `translate(${translate})`).e,
			...(control.dataset.sonicClipped === undefined
				? {}
				: { clipped: control.dataset.sonicClipped }),
			...(leg ? { leg } : {}),
		};
	});
}

async function positionOf(ticker: Locator): Promise<number> {
	const tape = await readTape(ticker);

	return tape.position;
}

async function legOf(ticker: Locator): Promise<Leg | undefined> {
	const tape = await readTape(ticker);

	return tape.leg;
}

async function legStateOf(ticker: Locator): Promise<string | undefined> {
	const leg = await legOf(ticker);

	return leg?.state;
}

async function swipe(
	page: Page,
	from: Point,
	...stops: Array<Point>
): Promise<() => Promise<void>> {
	const session = await page.context().newCDPSession(page);
	const moves = 10;
	let last = from;

	await session.send('Input.dispatchTouchEvent', { touchPoints: [from], type: 'touchStart' });
	for (const stop of stops) {
		for (let move = 1; move <= moves; move += 1) {
			const x = last.x + ((stop.x - last.x) * move) / moves;
			const y = last.y + ((stop.y - last.y) * move) / moves;

			await session.send('Input.dispatchTouchEvent', {
				touchPoints: [{ x, y }],
				type: 'touchMove',
			});
		}
		last = stop;
	}

	return async () => {
		await session.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' });
	};
}

async function holdMidTravel(ticker: Locator): Promise<number> {
	await ticker.evaluate((host: HTMLElement & { paused: boolean }) => {
		const [animation] = host.querySelector('.sonic-ticker-tape')?.getAnimations() ?? [];
		const timing = animation?.effect?.getTiming();
		if (!animation || !timing) throw new Error('No leg is running');

		host.paused = true;
		animation.currentTime = Number(timing.delay) + Number(timing.duration) / 2;
	});

	return positionOf(ticker);
}

function setCancellable(ticker: Locator): Promise<void> {
	return ticker.evaluate((host: HTMLElement & { cancellable: boolean }) => {
		host.cancellable = true;
		host.style.setProperty('--sonic-cancel-zone', '30px');
	});
}

function setPaused(ticker: Locator, isPaused: boolean): Promise<void> {
	return ticker.evaluate((host: HTMLElement & { paused: boolean }, paused) => {
		host.paused = paused;
	}, isPaused);
}

async function startOverPaused(ticker: Locator): Promise<void> {
	await ticker.evaluate((host: HTMLElement & { paused: boolean; text: string }) => {
		host.paused = true;
		host.text = `${host.text}, again`;
	});
	await expect(ticker.locator('.sonic-ticker-tape')).toContainText('again');
}

async function mouseDrag(page: Page, from: Point, by: number): Promise<void> {
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + 10 * Math.sign(by), from.y);
	await page.mouse.move(from.x + by, from.y, { steps: 4 });
}

test('content that fits is not overflowing, runs no leg and has no mask', async ({ page }) => {
	const tape = await readTape(page.locator('#fits'));

	expect(tape).toMatchObject({ isOverflowing: false, mask: 'none' });
	expect(tape.clipped).toBeUndefined();
	expect(tape.leg).toBeUndefined();
});

test('content that does not fit runs a leg across the distance at the rate, after the hold', async ({
	page,
}) => {
	const ticker = page.locator('#long');

	await startOverPaused(ticker);

	const tape = await readTape(ticker);

	expect(tape.distance).toBeGreaterThan(100);
	expect(tape).toMatchObject({ display: 'inline-block', isOverflowing: true });
	expect(tape.leg).toMatchObject({
		delay: hold,
		translate: ['0px', `${String(-tape.distance)}px`],
	});
	expect(tape.leg?.duration).toBeCloseTo((tape.distance / rate) * 1000, 3);
});

test('a fade is full with the tape well clear of its end, a third of what is past it close by, and gone at it', async ({
	page,
}) => {
	const ticker = page.locator('#long');
	const control = ticker.locator('.sonic-ticker');
	const fades = (): Promise<Array<string>> =>
		control.evaluate((element) => {
			const styles = getComputedStyle(element);

			return ['start', 'end'].map((end) => styles.getPropertyValue(`--_sonic-ticker-fade-${end}`));
		});
	const from = await centerOf(control);

	await startOverPaused(ticker);
	await expect(control).toHaveAttribute('data-sonic-clipped', 'end');
	expect(await fades()).toEqual(['0px', '12px']);

	await mouseDrag(page, from, -25);
	expect(await positionOf(ticker)).toBe(15);
	expect(await fades()).toEqual(['5px', '12px']);

	await page.mouse.move(from.x - 100, from.y);
	expect(await fades()).toEqual(['12px', '12px']);

	await page.mouse.move(from.x - 400, from.y);
	await expect(control).toHaveAttribute('data-sonic-clipped', 'start');
	expect(await fades()).toEqual(['12px', '0px']);
	await page.mouse.up();
});

test('over a leg each fade is animated, the one behind growing and the one ahead narrowing', async ({
	page,
}) => {
	const ticker = page.locator('#long');

	await startOverPaused(ticker);

	const halfway = await ticker.evaluate((host: HTMLElement & { paused: boolean }) => {
		const control = host.querySelector('.sonic-ticker');
		if (!control) throw new Error('The ticker did not render');

		host.paused = false;

		return control.getAnimations().map((animation) => {
			const timing = animation.effect?.getTiming();
			const keyframes = animation.effect instanceof KeyframeEffect ? animation.effect : undefined;
			const property = Object.keys(keyframes?.getKeyframes()[0] ?? {}).find((key) =>
				key.startsWith('--'),
			);

			animation.currentTime = Number(timing?.delay) + Number(timing?.duration) / 2;

			return [property, getComputedStyle(control).getPropertyValue(property ?? '')];
		});
	});

	expect(halfway).toEqual([
		['--_sonic-ticker-fade-start', '6px'],
		['--_sonic-ticker-fade-end', '6px'],
	]);
});

test('resized mid-travel, the tape carries on from where it was over the new distance', async ({
	page,
}) => {
	const ticker = page.locator('#steady');
	const before = await readTape(ticker);
	const position = await holdMidTravel(ticker);

	await page.locator('#resized').evaluate((box) => {
		box.style.inlineSize = '160px';
	});
	await expect
		.poll(async () => {
			const leg = await legOf(ticker);

			return leg?.translate[1];
		})
		.toBe(`${String(-(before.distance + 32))}px`);

	const after = await readTape(ticker);

	expect(after.distance).toBe(before.distance + 32);
	expect(after.position).toBeCloseTo(position, 1);
	expect(after.leg?.delay).toBe(0);
});

test('new content mid-travel puts the tape back at the start, held', async ({ page }) => {
	const ticker = page.locator('#steady');

	expect(await holdMidTravel(ticker)).toBeGreaterThan(50);
	await ticker.evaluate((host: HTMLElement & { text: string }) => {
		host.text = 'Another title altogether, every bit as long as the one before it was';
	});

	await expect.poll(() => positionOf(ticker)).toBe(0);
	expect(await legOf(ticker)).toMatchObject({ delay: hold });
	await expect(ticker.locator('.sonic-ticker')).toHaveAttribute('data-sonic-clipped', 'end');
});

test(
	'paused by the host, the tape stops where it is and carries on from there',
	{ tag: '@mobile' },
	async ({ page }) => {
		const ticker = page.locator('#steady');
		const position = await holdMidTravel(ticker);

		expect(await legStateOf(ticker)).toBe('paused');
		await expect(ticker.locator('.sonic-ticker')).toHaveAttribute('data-sonic-paused', '');
		expect(await positionOf(ticker)).toBe(position);

		await setPaused(ticker, false);
		expect(await legStateOf(ticker)).toBe('running');
		await expect.poll(() => positionOf(ticker)).toBeGreaterThan(position);
	},
);

test('a mouse over the ticker pauses it, and leaving lets it carry on', async ({ page }) => {
	const ticker = page.locator('#long');
	const { x, y } = await centerOf(ticker.locator('.sonic-ticker'));

	await page.mouse.move(x, y);
	await expect.poll(() => legStateOf(ticker)).toBe('paused');

	await page.mouse.move(x, y + 200);
	await expect.poll(() => legStateOf(ticker)).toBe('running');
});

test('focus by Tab on a link that holds the ticker pauses it', async ({ browserName, page }) => {
	const ticker = page.locator('#wrapped');

	await page.locator('#link-last').evaluate((host) => {
		host.remove();
	});
	await page.locator('#link-first .sonic-ticker a').focus();
	await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');

	await expect(page.locator('#wrapper')).toBeFocused();
	await expect.poll(() => legStateOf(ticker)).toBe('paused');

	await page.locator('#wrapper').blur();
	await expect.poll(() => legStateOf(ticker)).toBe('running');
});

test('scrolled out of view the tape stops, and carries on from the same place when it returns', async ({
	page,
}) => {
	const ticker = page.locator('#long');

	await expect(ticker.locator('.sonic-ticker')).toHaveAttribute('data-sonic-clipped', 'start end');
	await page.evaluate(() => {
		window.scrollTo(0, document.documentElement.scrollHeight);
	});
	await expect.poll(() => legStateOf(ticker)).toBe('paused');
	await expect(ticker.locator('.sonic-ticker')).not.toHaveAttribute('data-sonic-paused');

	await page.waitForTimeout(100);

	const position = await positionOf(ticker);

	expect(position).toBeGreaterThan(0);
	await page.waitForTimeout(300);
	expect(await positionOf(ticker)).toBe(position);

	await page.evaluate(() => {
		window.scrollTo(0, 0);
	});
	await expect.poll(() => legStateOf(ticker)).toBe('running');
	expect(await legOf(ticker)).toMatchObject({ translate: ['0px', expect.any(String)] });
});

test('a mouse drag moves the tape with it, clamps at each end, and let go the tape holds there and carries on', async ({
	page,
}) => {
	const ticker = page.locator('#long');
	const from = await centerOf(ticker.locator('.sonic-ticker'));
	const { distance } = await readTape(ticker);

	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x - 2, from.y);
	expect(await readTape(ticker)).toMatchObject({ isDragging: false, position: 0 });

	await page.mouse.move(from.x - 10, from.y);
	await page.mouse.move(from.x - 50, from.y);

	const dragged = await readTape(ticker);

	expect(dragged).toMatchObject({ clipped: 'start end', isDragging: true, position: 40 });
	expect(dragged.leg).toBeUndefined();

	await page.mouse.move(from.x - 400, from.y);
	expect(await readTape(ticker)).toMatchObject({ clipped: 'start', position: distance });

	await page.mouse.move(from.x + 400, from.y);
	expect(await readTape(ticker)).toMatchObject({ clipped: 'end', position: 0 });

	await page.mouse.move(from.x - 40, from.y);
	await page.mouse.up();

	const dropped = await readTape(ticker);

	expect(dropped).toMatchObject({ isDragging: false, position: 30 });
	expect(dropped.leg).toMatchObject({
		delay: hold,
		translate: ['-30px', `${String(-distance)}px`],
	});

	await page.mouse.move(from.x, from.y + 200);
	await expect.poll(() => positionOf(ticker)).toBeGreaterThan(30);
});

test('strayed across the line past the zone, a cancellable drag puts the tape back, resumes when the mouse returns, and let go outside leaves it there', async ({
	page,
}) => {
	const ticker = page.locator('#long');
	const control = ticker.locator('.sonic-ticker');
	const box = await boxOf(control);
	const from = await centerOf(control);
	const below = box.y + box.height;

	await setCancellable(ticker);

	const origin = await holdMidTravel(ticker);

	await mouseDrag(page, from, -50);
	await page.mouse.move(from.x - 50, below + 24);
	expect(await positionOf(ticker)).toBeCloseTo(origin + 40, 1);
	await expect(control).not.toHaveAttribute('data-sonic-cancelling');

	await page.mouse.move(from.x - 50, below + 36);
	expect(await positionOf(ticker)).toBeCloseTo(origin, 1);
	await expect(control).toHaveAttribute('data-sonic-cancelling', '');
	expect(await readTape(ticker)).toMatchObject({ isDragging: true });

	await page.mouse.move(from.x - 70, from.y);
	expect(await positionOf(ticker)).toBeCloseTo(origin + 60, 1);
	await expect(control).not.toHaveAttribute('data-sonic-cancelling');

	await page.mouse.move(from.x - 70, box.y - 36);
	await page.mouse.up();

	const dropped = await readTape(ticker);

	expect(dropped).toMatchObject({ isDragging: false });
	expect(dropped.position).toBeCloseTo(origin, 1);
	expect(dropped.leg).toMatchObject({ delay: hold });
	await expect(control).not.toHaveAttribute('data-sonic-cancelling');
});

test('dropped at the end it was heading for, the tape heads back', async ({ page }) => {
	const ticker = page.locator('#long');
	const from = await centerOf(ticker.locator('.sonic-ticker'));
	const { distance } = await readTape(ticker);

	await mouseDrag(page, from, -400);
	await page.mouse.up();

	expect(await legOf(ticker)).toMatchObject({
		delay: hold,
		translate: [`${String(-distance)}px`, '0px'],
	});
});

for (const { hash, name, press } of [
	{ hash: '#inside', name: 'a link inside the tape', press: '#link-first .sonic-ticker a' },
	{ hash: '#wrapped', name: 'a link round the ticker', press: '#wrapped .sonic-ticker' },
]) {
	test(`a drag over ${name} does not follow it, and a click does`, async ({ page }) => {
		const from = await centerOf(page.locator(press));

		await mouseDrag(page, from, -40);
		await page.mouse.up();
		await page.mouse.move(from.x, from.y + 300);
		expect(new URL(page.url()).hash).toBe('');

		await page.locator(press).click();
		await expect.poll(() => new URL(page.url()).hash).toBe(hash);
	});
}

test('a link in the tape, focused while scrolled out, comes inside the box, and the box scrolls back when focus leaves', async ({
	page,
}) => {
	const ticker = page.locator('#link-last');
	const control = ticker.locator('.sonic-ticker');
	const link = control.locator('a');

	await link.focus();

	const box = await boxOf(control);
	const focused = await boxOf(link);

	expect(focused.x).toBeGreaterThanOrEqual(box.x);
	expect(focused.x + focused.width).toBeLessThanOrEqual(box.x + box.width + 1);
	expect(await legOf(ticker)).toBeUndefined();
	expect(await positionOf(ticker)).toBe(0);
	expect(await control.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

	await link.blur();
	expect(await control.evaluate((element) => element.scrollLeft)).toBe(0);
	expect(await legOf(ticker)).toMatchObject({ delay: hold });
});

test('text replaces the content and keeps the control', async ({ page }) => {
	const ticker = page.locator('#link-first');

	await ticker.evaluate((host: HTMLElement & { text: string }) => {
		host.text = 'Next';
	});

	await expect(ticker.locator('.sonic-ticker-tape')).toHaveText('Next');
	await expect(ticker.locator('.sonic-ticker a')).toHaveCount(0);
	await expect(ticker.locator('.sonic-ticker')).not.toHaveAttribute('data-sonic-overflowing');
});

test('the whole content is in the accessibility tree while clipped, once', async ({
	browserName,
	page,
}) => {
	test.skip(browserName !== 'chromium', 'The accessibility tree is read over CDP');

	const session = await page.context().newCDPSession(page);
	const { nodes } = await session.send('Accessibility.getFullAXTree');

	await session.detach();

	expect(
		nodes.filter(
			(node) =>
				!node.ignored &&
				node.role?.value === 'StaticText' &&
				String(node.name?.value).includes('keeps the whole catalogue in one place'),
		),
	).toHaveLength(1);
	expect(
		nodes.filter(
			(node) =>
				!node.ignored && node.role?.value === 'link' && node.name?.value === "The label's page",
		),
	).toHaveLength(1);
});

test.describe('reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('nothing moves by itself: no leg, no mask and an inline tape under the ellipsis', async ({
		page,
	}) => {
		const tape = await readTape(page.locator('#long'));

		expect(tape).toMatchObject({
			clipped: 'end',
			display: 'inline',
			isOverflowing: true,
			mask: 'none',
		});
		expect(tape.leg).toBeUndefined();
		expect(
			await page
				.locator('#long .sonic-ticker')
				.evaluate((element) => getComputedStyle(element).textOverflow),
		).toBe('ellipsis');
	});

	test('dragged, the tape stays where it is dropped and takes the fades, and new content puts it back', async ({
		page,
	}) => {
		const ticker = page.locator('#long');
		const from = await centerOf(ticker.locator('.sonic-ticker'));

		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		await page.mouse.move(from.x - 10, from.y);
		await page.mouse.move(from.x - 70, from.y);
		await page.mouse.up();
		await page.mouse.move(from.x, from.y + 200);

		const dropped = await readTape(ticker);

		expect(dropped).toMatchObject({ clipped: 'start end', display: 'inline-block', position: 60 });
		expect(dropped.leg).toBeUndefined();
		expect(dropped.mask).not.toBe('none');

		await page.waitForTimeout(hold + 200);
		expect(await positionOf(ticker)).toBe(60);

		await ticker.evaluate((host: HTMLElement & { text: string }) => {
			host.text = 'Another title altogether, every bit as long as the one before it was';
		});
		await expect.poll(() => positionOf(ticker)).toBe(0);
		expect(await readTape(ticker)).toMatchObject({ display: 'inline' });
	});
});

test.describe('by touch', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'A touch swipe needs CDP');
	test.use({ hasTouch: true, viewport: { height: 400, width: 400 } });

	test('a sideways swipe drags the tape and not the page, and lifting lets it carry on', async ({
		page,
	}) => {
		const ticker = page.locator('#link-first');
		const from = await centerOf(ticker.locator('.sonic-ticker a'));
		const lift = await swipe(page, from, { x: from.x - 60, y: from.y });

		const dragged = await readTape(ticker);

		expect(dragged.isDragging).toBe(true);
		expect(dragged.position).toBeGreaterThan(40);

		await lift();

		const dropped = await readTape(ticker);

		expect(dropped.isDragging).toBe(false);
		expect(dropped.leg).toMatchObject({ delay: hold, state: 'running' });
		expect(await page.evaluate(() => window.scrollY)).toBe(0);
		expect(new URL(page.url()).hash).toBe('');
	});

	test('a finger that strays past the zone mid-drag puts the tape back without scrolling the page', async ({
		page,
	}) => {
		const ticker = page.locator('#link-first');
		const control = ticker.locator('.sonic-ticker');
		const from = await centerOf(control.locator('a'));

		await setCancellable(ticker);
		await startOverPaused(ticker);

		const lift = await swipe(
			page,
			from,
			{ x: from.x - 60, y: from.y },
			{ x: from.x - 60, y: from.y + 70 },
		);

		await expect(control).toHaveAttribute('data-sonic-cancelling', '');
		expect(await readTape(ticker)).toMatchObject({ isDragging: true, position: 0 });

		await lift();

		expect(await readTape(ticker)).toMatchObject({ isDragging: false, position: 0 });
		await expect(control).not.toHaveAttribute('data-sonic-cancelling');
		expect(await page.evaluate(() => window.scrollY)).toBe(0);
		expect(new URL(page.url()).hash).toBe('');
	});

	test('a mostly vertical swipe from the ticker scrolls the page and leaves the tape', async ({
		page,
	}) => {
		const ticker = page.locator('#long');
		const from = await centerOf(ticker.locator('.sonic-ticker'));
		const lift = await swipe(page, from, { x: from.x + 20, y: from.y - 150 });

		await lift();

		await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
		expect(await readTape(ticker)).toMatchObject({ isDragging: false });
	});
});
