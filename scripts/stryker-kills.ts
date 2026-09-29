import { readFileSync } from 'node:fs';

interface Report {
	files: Record<string, { mutants: Array<{ killedBy?: Array<string> }> }>;
	testFiles?: Record<string, { tests: Array<{ id: string; name: string }> }>;
}

interface Kills {
	name: string;
	total: number;
	unique: number;
}

const reportPath = '.cache/stryker/mutation-report.json';
const report = JSON.parse(readFileSync(reportPath, 'utf8')) as Report;
const testFiles = Object.entries(report.testFiles ?? {});
const kills = new Map<string, Kills>();

for (const [file, { tests }] of testFiles) {
	for (const test of tests)
		kills.set(test.id, { name: `${file} › ${test.name}`, total: 0, unique: 0 });
}

const killers = Object.values(report.files).flatMap(({ mutants }) =>
	mutants.map((mutant) => mutant.killedBy ?? []),
);

for (const killedBy of killers) {
	for (const id of killedBy) {
		const entry = kills.get(id);
		if (!entry) continue;

		entry.total += 1;
		if (killedBy.length === 1) entry.unique += 1;
	}
}

const ranked = [...kills.values()].toSorted(
	(first, second) => first.unique - second.unique || first.total - second.total,
);

console.log('unique  total  test');
for (const { name, total, unique } of ranked) {
	console.log(`${String(unique).padStart(6)}  ${String(total).padStart(5)}  ${name}`);
}
console.log(
	`\n${String(ranked.filter((entry) => entry.unique === 0).length)} of ${String(ranked.length)} tests are the sole killer of no mutant`,
);
