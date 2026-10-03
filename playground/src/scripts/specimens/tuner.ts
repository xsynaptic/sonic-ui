import type { TunerToken } from '#scripts/specimens/tuner-tokens.ts';

import { resolvedProperty, tokenGroups } from '#scripts/specimens/tuner-tokens.ts';

interface Row {
	baseline: string;
	from: string;
	input: HTMLInputElement | HTMLSelectElement;
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

// A colour input takes only sRGB hex, so each colour round-trips through a canvas pixel
function toHex(colour: string, { context, probe }: Reader): string {
	probe.style.color = colour;
	context.clearRect(0, 0, 1, 1);
	context.fillStyle = getComputedStyle(probe).color;
	context.fillRect(0, 0, 1, 1);

	const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;

	return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function dropUnit(length: string): number {
	// eslint-disable-next-line unicorn/prefer-number-coercion -- `Number` reads "32px" as `NaN`
	return Number.parseFloat(length);
}

function readBaseline(row: Row, reader: Reader): string {
	const { token } = row;
	if (token.kind === 'choice') return '';

	const part = reader.panel.querySelector(row.from);
	if (!part) return row.input.value;

	const raw = getComputedStyle(part).getPropertyValue(resolvedProperty(token)).trim();

	if (token.kind === 'colour') return toHex(raw, reader);

	const value = dropUnit(raw);
	if (token.unit !== 'rem') return String(value);

	return String(value / dropUnit(getComputedStyle(document.documentElement).fontSize));
}

function valueOf(row: Row): string {
	return row.token.kind === 'range' ? `${row.input.value}${row.token.unit}` : row.input.value;
}

function collectRows(root: HTMLElement): Array<Row> {
	const rows: Array<Row> = [];

	for (const input of root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-token]')) {
		const entry = tokens.get(input.dataset.token ?? '');
		const output = input.parentElement?.querySelector('output') ?? undefined;

		if (entry) rows.push({ ...entry, baseline: '', input, output });
	}

	return rows;
}

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
