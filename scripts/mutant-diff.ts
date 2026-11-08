// A difference on random inputs proves a survivor killable; none in many runs suggests it is equivalent
import fc from 'fast-check';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';

interface Probe<Input> {
	file: string;
	input: fc.Arbitrary<Input>;
	run: (module: Record<string, unknown>, input: Input) => unknown;
}

// Handed fast-check, a probe imports nothing and can live outside the repo
export type ProbeFactory<Input> = (check: typeof fc) => Probe<Input>;

interface ReportMutant {
	id: string;
	location: { end: { column: number; line: number }; start: { column: number; line: number } };
	mutatorName: string;
	replacement?: string;
	status: string;
}

interface Report {
	files: Record<string, { mutants: Array<ReportMutant>; source: string }>;
}

type Outcome = { threw: string } | { value: unknown };

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		report: { default: '.cache/stryker/mutation.json', type: 'string' },
		runs: { default: '20000', type: 'string' },
	},
});
const [probePath, ...lineRanges] = positionals;
if (probePath === undefined) {
	throw new Error(
		'Usage: pnpm mutant-diff <probe.ts> [line or from-to ...] [--runs n] [--report path]',
	);
}

const probeModule = (await import(pathToFileURL(path.resolve(probePath)).href)) as {
	default: ProbeFactory<unknown>;
};
const probe = probeModule.default(fc);
const report = JSON.parse(readFileSync(values.report, 'utf8')) as Report;
const reported = report.files[probe.file];
if (!reported) throw new Error(`${values.report} has no mutants for ${probe.file}`);
if (reported.source !== readFileSync(probe.file, 'utf8')) {
	throw new Error(
		`${probe.file} has changed since ${values.report} was written; run Stryker again`,
	);
}

function isWanted(line: number): boolean {
	if (lineRanges.length === 0) return true;

	return lineRanges.some((range) => {
		const [from = NaN, to = from] = range.split('-').map(Number);

		return line >= from && line <= to;
	});
}

const lineStarts = [0];
for (const text of reported.source.split('\n'))
	lineStarts.push((lineStarts.at(-1) ?? 0) + text.length + 1);

function offsetOf({ column, line }: { column: number; line: number }): number {
	return (lineStarts[line - 1] ?? NaN) + column - 1;
}

async function outcome(module: Record<string, unknown>, input: unknown): Promise<Outcome> {
	try {
		return { value: await probe.run(module, input) };
	} catch (error) {
		return { threw: String(error) };
	}
}

function packageOf(file: string): string {
	let folder = path.dirname(file);

	while (!existsSync(path.join(folder, 'package.json')) && folder !== path.dirname(folder)) {
		folder = path.dirname(folder);
	}

	return folder;
}

// Inside the package, `#lib/*` and the other subpath imports resolve as they do for the original
const copies = path.join(packageOf(path.resolve(probe.file)), '.cache/mutant-diff');
const survivors = reported.mutants.filter(
	({ location, status }) => status === 'Survived' && isWanted(location.start.line),
);

Object.assign(globalThis, { __DEV__: true });
mkdirSync(copies, { recursive: true });

const original = (await import(pathToFileURL(path.resolve(probe.file)).href)) as Record<
	string,
	unknown
>;

for (const { id, location, mutatorName, replacement = '' } of survivors) {
	const { column, line } = location.start;
	const copy = path.join(copies, `mutant-${id}.ts`);

	process.stdout.write(
		`${String(line)}:${String(column)} ${mutatorName} ${JSON.stringify(replacement)}: `,
	);
	writeFileSync(
		copy,
		reported.source.slice(0, offsetOf(location.start)) +
			replacement +
			reported.source.slice(offsetOf(location.end)),
	);

	const mutant = (await import(pathToFileURL(path.resolve(copy)).href)) as Record<string, unknown>;
	const result = await fc.check(
		fc.asyncProperty(probe.input, async (input) =>
			isDeepStrictEqual(await outcome(original, input), await outcome(mutant, input)),
		),
		{ numRuns: Number(values.runs), seed: 1 },
	);
	if (!result.failed) {
		console.log(`no difference in ${values.runs} runs`);
		continue;
	}

	const [input] = result.counterexample ?? [];
	console.log(`differs on ${fc.stringify(input)}`);
	console.log(`  original ${fc.stringify(await outcome(original, input))}`);
	console.log(`  mutant   ${fc.stringify(await outcome(mutant, input))}`);
}

rmSync(copies, { force: true, recursive: true });
