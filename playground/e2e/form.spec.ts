import type { Locator, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { drag, mouseOnly } from './pointer.ts';

test.beforeEach(async ({ page }) => {
	await page.goto('/fixtures/form/');
});

function readFormData(page: Page): Promise<Array<[string, string]>> {
	return page.locator('#patch').evaluate((form) => {
		if (!(form instanceof HTMLFormElement)) throw new Error('#patch is not a form');

		return [...new FormData(form)].map(([name, value]) => [
			name,
			typeof value === 'string' ? value : value.name,
		]);
	});
}

function readBridge(host: Locator, control: string): Promise<{ bridged: number; labels: number }> {
	return host.evaluate((element, selector) => {
		const labelled = element.querySelector(selector)?.ariaLabelledByElements ?? [];
		const labels =
			'labels' in element && element.labels instanceof NodeList ? [...element.labels] : [];

		return {
			bridged: labelled.filter((label) => labels.includes(label)).length,
			labels: labels.length,
		};
	}, control);
}

// Playwright's own name computation reads only the `aria-labelledby` attribute, so this reads the browser's tree
async function readNames(page: Page): Promise<Array<string>> {
	const session = await page.context().newCDPSession(page);
	const { nodes } = await session.send('Accessibility.getFullAXTree');

	await session.detach();

	return nodes
		.filter(
			(node) =>
				!node.ignored &&
				node.name?.value &&
				!['InlineTextBox', 'StaticText'].includes(String(node.role?.value)),
		)
		.map((node) => `${String(node.role?.value)}: ${String(node.name?.value)}`);
}

function readCustomProperty(page: Page, selector: string, property: string): Promise<string> {
	return page
		.locator(selector)
		.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name).trim(), property);
}

test('a label for the host, around it, or added later reaches the inner control and names it', async ({
	browserName,
	page,
}) => {
	const bridges = {
		cutoff: await readBridge(page.locator('#cutoff'), '.sonic-dial'),
		mode: await readBridge(page.locator('#mode'), '.sonic-segmented'),
		mute: await readBridge(page.locator('#mute'), '.sonic-button'),
		send: await readBridge(page.locator('#send'), '.sonic-slider'),
		sync: await readBridge(page.locator('#sync'), '[role="switch"]'),
		tempo: await readBridge(page.locator('#tempo'), '.sonic-number'),
		touchX: await readBridge(page.locator('#touch'), '[data-sonic-axis="x"]'),
		touchY: await readBridge(page.locator('#touch'), '[data-sonic-axis="y"]'),
	};

	expect(bridges).toEqual({
		cutoff: { bridged: 1, labels: 1 },
		mode: { bridged: 1, labels: 1 },
		mute: { bridged: 1, labels: 1 },
		send: { bridged: 1, labels: 1 },
		sync: { bridged: 1, labels: 1 },
		tempo: { bridged: 1, labels: 1 },
		touchX: { bridged: 1, labels: 1 },
		touchY: { bridged: 1, labels: 1 },
	});

	const host = page.locator('#late');

	await host.evaluate((element) => {
		const label = document.createElement('label');

		label.htmlFor = element.id;
		label.textContent = 'Late';
		element.before(label);
	});
	await host.locator('.sonic-dial').focus();

	expect(await readBridge(host, '.sonic-dial')).toEqual({ bridged: 1, labels: 1 });

	// Only Chromium exposes its accessibility tree, where the host adds no node
	if (browserName !== 'chromium') return;

	const names = await readNames(page);
	const labelled = names.filter((name) =>
		/: (Cutoff|Send|Sync|Tempo|Mute|Mode|Touch|Late)$/.test(name),
	);

	expect(labelled.toSorted((first, second) => first.localeCompare(second))).toEqual([
		'button: Mute',
		'radiogroup: Mode',
		'slider: Cutoff',
		'slider: Late',
		'slider: Send',
		'slider: Touch',
		'spinbutton: Tempo',
		'switch: Sync',
	]);
});

test('a label click focuses the value control and the segmented control, flips a bare switch, and presses the button once', async ({
	page,
}) => {
	await page.locator('label[for="cutoff"]').click();
	await expect(page.locator('#cutoff .sonic-dial')).toBeFocused();

	await page.locator('label[for="mode"]').click();
	await expect(page.locator('#mode [aria-checked="true"]')).toBeFocused();

	await page.locator('label[for="sync"]').click();
	await expect(page.locator('#sync [role="switch"]')).toHaveAttribute('aria-checked', 'true');

	const button = page.locator('#mute .sonic-button');

	await page.getByText('Mute', { exact: true }).click();
	await expect(button).toHaveAttribute('aria-pressed', 'true');

	// Inside a wrapping label, Firefox follows a click on the control with one on the host
	await button.click();
	await expect(button).toHaveAttribute('aria-pressed', 'false');
});

test('the form submits each value, a latching button only when pressed, and a reset returns every control to its attributes', async ({
	page,
}) => {
	const initial: Array<[string, string]> = [
		['cutoff', '40'],
		['send', '30'],
		['tempo', '120'],
		['solo', 'yes'],
		['mode', 'lp'],
		['assign', 'x'],
		['late', '10'],
		['touch.x', '40'],
		['touch.y', '60'],
		['position', '150'],
		['detail', '90'],
	];

	expect(await readFormData(page)).toEqual(initial);

	await page.locator('#cutoff .sonic-dial').press('ArrowUp');
	await page.locator('#tempo .sonic-number').press('ArrowDown');
	await page.locator('#mute .sonic-button').click();
	await page.locator('#solo .sonic-button').click();
	await page.getByRole('radio', { name: 'HP' }).click();
	await page.locator('#sync [role="switch"]').click();
	await page.getByRole('radio', { name: 'Y' }).click();
	await page.locator('#touch [data-sonic-axis="x"]').press('ArrowUp');
	await page.locator('#touch [data-sonic-axis="y"]').press('ArrowRight');
	await page.locator('#position .sonic-wavestrip').press('ArrowRight');
	await page.locator('#detail .sonic-waveform').press('ArrowLeft');

	expect(await readFormData(page)).toEqual([
		['cutoff', '45'],
		['send', '30'],
		['tempo', '119.5'],
		['mute', 'on'],
		['mode', 'hp'],
		['sync', 'on'],
		['assign', 'y'],
		['late', '10'],
		['touch.x', '45'],
		['touch.y', '61'],
		['position', '155'],
		['detail', '88'],
	]);

	await page.locator('#patch').evaluate((form) => {
		if (form instanceof HTMLFormElement) form.reset();
	});

	for (const [control, name, value] of [
		[page.locator('#cutoff .sonic-dial'), 'aria-valuenow', '40'],
		[page.locator('#tempo .sonic-number'), 'aria-valuenow', '120'],
		[page.locator('#mute .sonic-button'), 'aria-pressed', 'false'],
		[page.locator('#solo .sonic-button'), 'aria-pressed', 'true'],
		[page.getByRole('radio', { name: 'LP' }), 'aria-checked', 'true'],
		[page.locator('#sync [role="switch"]'), 'aria-checked', 'false'],
		[page.getByRole('radio', { name: 'X' }), 'aria-checked', 'true'],
		[page.locator('#touch [data-sonic-axis="x"]'), 'aria-valuenow', '40'],
		[page.locator('#touch [data-sonic-axis="y"]'), 'aria-valuenow', '60'],
		[page.locator('#position .sonic-wavestrip'), 'aria-valuenow', '150'],
		[page.locator('#detail .sonic-waveform'), 'aria-valuenow', '90'],
	] as const) {
		await expect(control).toHaveAttribute(name, value);
	}
	expect(await readFormData(page)).toEqual(initial);
});

test('a disabled fieldset disables the dial inside it until re-enabled', async ({
	isMobile,
	page,
}) => {
	test.skip(isMobile, mouseOnly);

	const host = page.locator('#drive');
	const control = host.locator('.sonic-dial');

	await expect(control).not.toHaveAttribute('tabindex');
	await expect(control).toHaveAttribute('aria-disabled', 'true');
	await drag(page, control, { x: 0, y: -32 });
	await host.evaluate((element: HTMLElement) => {
		element.focus();
	});
	await page.keyboard.press('ArrowUp');
	await expect(control).toHaveAttribute('aria-valuenow', '50');
	await expect(control).not.toBeFocused();

	await page.locator('#rack').evaluate((fieldset) => {
		if (fieldset instanceof HTMLFieldSetElement) fieldset.disabled = false;
	});

	await expect(control).toHaveAttribute('tabindex', '0');
	await expect(control).not.toHaveAttribute('aria-disabled');
	await drag(page, control, { x: 0, y: -32 });
	await expect(control).toHaveAttribute('aria-valuenow', '70');
	expect(await readFormData(page)).toContainEqual(['drive', '70']);
});

test('a dial in a disabled fieldset takes the disabled skin, forced colours included', async ({
	browserName,
	page,
}) => {
	const lit = (selector: string): Promise<string> =>
		readCustomProperty(page, `${selector} .sonic-dial`, '--_sonic-dial-lit');

	expect(await lit('#drive')).toBe(await lit('#held'));
	expect(await lit('#drive')).not.toBe(await lit('#cutoff'));

	test.skip(browserName === 'webkit', 'WebKit has no forced-colours mode');

	await page.emulateMedia({ forcedColors: 'active' });

	expect(await readCustomProperty(page, '#drive .sonic-dial', '--_sonic-ink')).toBe('GrayText');
	expect(await readCustomProperty(page, '#cutoff .sonic-dial', '--_sonic-ink')).not.toBe(
		'GrayText',
	);
});

// Firefox hands a state to the wrong control when tags upgrade out of document order, as this fixture's do
test('back navigation restores what each control held, never what another held', async ({
	browserName,
	page,
}) => {
	const controls = ['cutoff', 'mode', 'mute', 'send', 'solo'] as const;
	const original = { cutoff: '40', mode: 'lp', mute: 'false', send: '30', solo: 'true' };
	const changed = { cutoff: '45', mode: 'hp', mute: 'true', send: '31', solo: 'false' };

	await page.locator('#cutoff .sonic-dial').press('ArrowUp');
	await page.locator('#send .sonic-slider').press('ArrowUp');
	await page.locator('#mute .sonic-button').click();
	await page.locator('#solo .sonic-button').click();
	await page.getByRole('radio', { name: 'HP' }).click();
	await page.goto('/fixtures/docked/');
	await page.goBack();
	await expect(page.locator('#send .sonic-slider')).toHaveAttribute('aria-valuenow');

	const reads = {
		cutoff: ['#cutoff .sonic-dial', 'aria-valuenow'],
		mode: ['#mode [aria-checked="true"] [data-sonic-value]', 'data-sonic-value'],
		mute: ['#mute .sonic-button', 'aria-pressed'],
		send: ['#send .sonic-slider', 'aria-valuenow'],
		solo: ['#solo .sonic-button', 'aria-pressed'],
	} as const;
	const held = Object.fromEntries(
		await Promise.all(
			controls.map(async (control) => {
				const [selector, name] = reads[control];

				return [control, await page.locator(selector).getAttribute(name)] as const;
			}),
		),
	);

	for (const control of controls) {
		expect([original[control], changed[control]], control).toContain(held[control]);
	}
	if (browserName !== 'firefox') expect(held).toEqual(changed);
});
