import type { TunerToken } from '#scripts/tuner-tokens.ts';

import { tokenGroups } from '#scripts/tuner-tokens.ts';

interface Row {
	// The input's value with nothing tuned
	baseline: string;
	from: string;
	input: HTMLInputElement;
	output: HTMLOutputElement | undefined;
	token: TunerToken;
}

interface Reader {
	context: CanvasRenderingContext2D;
	panel: HTMLElement;
	probe: HTMLElement;
}

const tokens = new Map(
	tokenGroups.flatMap((group) =>
		group.tokens.map((token) => [token.token, { from: token.from ?? group.from, token }] as const),
	),
);

// A colour input takes only sRGB hex, so each resolved colour is painted to one pixel and read back
function toHex(colour: string, { context, probe }: Reader): string {
	probe.style.color = colour;
	context.clearRect(0, 0, 1, 1);
	context.fillStyle = getComputedStyle(probe).color;
	context.fillRect(0, 0, 1, 1);

	const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;

	return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function readBaseline(row: Row, reader: Reader): string {
	const { token } = row;
	const part = reader.panel.querySelector(row.from);
	if (!part) return row.input.value;

	const raw = getComputedStyle(part)
		.getPropertyValue(token.resolved ?? token.token.replace('--sonic-', '--_sonic-'))
		.trim();

	// eslint-disable-next-line unicorn/prefer-number-coercion -- a length such as "2.5rem" needs its unit dropped
	return token.kind === 'colour' ? toHex(raw, reader) : String(Number.parseFloat(raw));
}

function valueOf(row: Row): string {
	return row.token.kind === 'range' ? `${row.input.value}${row.token.unit}` : row.input.value;
}

function collectRows(root: HTMLElement): Array<Row> {
	const rows: Array<Row> = [];

	for (const input of root.querySelectorAll<HTMLInputElement>('input[data-token]')) {
		const entry = tokens.get(input.dataset.token ?? '');
		const output = input.parentElement?.querySelector('output') ?? undefined;

		if (entry) rows.push({ ...entry, baseline: '', input, output });
	}

	return rows;
}

// Only tuned tokens go on the page, so an untouched one leaves the skin's value alone
function render(rows: Array<Row>, count: HTMLElement, output: HTMLElement): void {
	const changed = rows.filter((row) => row.input.value !== row.baseline);

	for (const row of rows) {
		if (row.output) row.output.textContent = valueOf(row);
		if (changed.includes(row)) document.body.style.setProperty(row.token.token, valueOf(row));
		else document.body.style.removeProperty(row.token.token);
	}
	output.textContent = changed.map((row) => `${row.token.token}: ${valueOf(row)};`).join('\n');
	output.hidden = changed.length === 0;
	count.textContent = changed.length === 0 ? 'Nothing tuned' : `${String(changed.length)} tuned`;
}

// Read with nothing tuned, so a skin's own values become the baseline
function rebase(rows: Array<Row>, reader: Reader): void {
	for (const row of rows) document.body.style.removeProperty(row.token.token);
	for (const row of rows) {
		const isTuned = row.baseline !== '' && row.input.value !== row.baseline;
		const tuned = row.input.value;

		row.input.value = readBaseline(row, reader);
		row.baseline = row.input.value;
		if (isTuned) row.input.value = tuned;
	}
}

function bindTuner(root: HTMLElement, reader: Reader): void {
	const count = root.querySelector<HTMLElement>('[data-tuner-count]');
	const output = root.querySelector<HTMLElement>('[data-tuner-output]');
	if (!count || !output) return;

	const rows = collectRows(root);
	const update = (): void => {
		render(rows, count, output);
	};
	const refresh = (): void => {
		rebase(rows, reader);
		update();
	};

	for (const row of rows) row.input.addEventListener('input', update);
	root.querySelector('[data-tuner-reset]')?.addEventListener('click', () => {
		for (const row of rows) row.input.value = row.baseline;
		update();
	});
	root.querySelector('[data-tuner-copy]')?.addEventListener('click', () => {
		void navigator.clipboard.writeText(output.textContent);
	});
	document.addEventListener('playground-skin', refresh);
	refresh();
}

const tuner = document.querySelector<HTMLElement>('[data-tuner]');
const panel = tuner?.querySelector<HTMLElement>('[data-tuner-panel]');
const probe = tuner?.querySelector<HTMLElement>('[data-tuner-probe]');
const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });

if (tuner && panel && probe && context) bindTuner(tuner, { context, panel, probe });
