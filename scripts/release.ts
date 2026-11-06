import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

interface PackageManifest {
	name: string;
	version: string;
}

const releasePaths = ['packages', '.changeset', 'pnpm-lock.yaml'];

function run(command: string, args: Array<string>) {
	const result = spawnSync(command, args, { stdio: 'inherit' });

	if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
}

function git(args: Array<string>) {
	return spawnSync('git', args, { encoding: 'utf8' });
}

async function isPublished({ name, version }: PackageManifest) {
	const response = await fetch(`https://registry.npmjs.org/${name}/${version}`, { method: 'HEAD' });

	if (response.status === 404) return false;
	if (!response.ok)
		throw new Error(`npm registry answered ${String(response.status)} for ${name}@${version}`);

	return true;
}

async function release() {
	const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD']).stdout.trim();

	if (branch !== 'main') throw new Error(`Release from main; HEAD is ${branch || 'detached'}`);

	const uncommitted = git(['status', '--porcelain', '--', ...releasePaths]).stdout.trimEnd();

	if (uncommitted) throw new Error(`Commit or stash these before releasing:\n${uncommitted}`);

	const hasChangesets = readdirSync('.changeset').some(
		(fileName) => fileName.endsWith('.md') && fileName !== 'README.md',
	);

	if (hasChangesets)
		throw new Error('Pending changesets; run `pnpm changeset version` and commit first');

	const manifest = JSON.parse(
		readFileSync('packages/sonic-ui/package.json', 'utf8'),
	) as PackageManifest;
	const tag = `${manifest.name}@${manifest.version}`;

	if (await isPublished(manifest)) {
		run('git', ['fetch', '--quiet', 'origin', 'main']);

		if (git(['merge-base', '--is-ancestor', tag, 'origin/main']).status !== 0)
			throw new Error(
				`${tag} is on npm but not on origin/main; push with \`git push --follow-tags origin main\``,
			);

		console.log(`Nothing to release; ${tag} is already on npm`);
		return;
	}

	console.log(`Releasing ${tag}\n`);

	run('pnpm', ['check']);
	run('pnpm', ['check-pkg']);
	run('pnpm', ['test-e2e']);
	run('pnpm', ['changeset', 'publish']);
	run('git', ['push', '--no-verify', '--follow-tags', 'origin', 'main']);
}

try {
	await release();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
