import type { Token } from '#scripts/specimens/token-groups.ts';

import { resolvedProperty, tokenGroups } from '#scripts/specimens/token-groups.ts';

interface Row {
	baseline: string;
	from: string;
	input: HTMLInputElement | HTMLSelectElement;
	output: HTMLOutputElement | undefined;
	token: Token;
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

function render(rows: Array<Row>): void {
	for (const row of rows) {
		if (row.output) row.output.textContent = valueOf(row);
		if (row.input.value === row.baseline) document.body.style.removeProperty(row.token.token);
		else document.body.style.setProperty(row.token.token, valueOf(row));
	}
}

function rebase(rows: Array<Row>, reader: Reader): void {
	for (const row of rows) document.body.style.removeProperty(row.token.token);
	for (const row of rows) {
		row.input.value = readBaseline(row, reader);
		row.baseline = row.input.value;
	}
}

function bindTokens(root: HTMLElement, reader: Reader): void {
	const rows = collectRows(root);
	const refresh = (): void => {
		rebase(rows, reader);
		render(rows);
	};

	for (const row of rows) {
		row.input.addEventListener('input', () => {
			render(rows);
		});
	}
	document.addEventListener('playground-skin', refresh);
	matchMedia('(forced-colors: active)').addEventListener('change', refresh);
	refresh();
}

const root = document.querySelector<HTMLElement>('[data-tokens]');
const panel = root?.querySelector<HTMLElement>('[data-tokens-panel]');
const probe = root?.querySelector<HTMLElement>('[data-tokens-probe]');
const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });

if (root && panel && probe && context) bindTokens(root, { context, panel, probe });
