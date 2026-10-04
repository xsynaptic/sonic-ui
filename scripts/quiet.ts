import { spawnSync } from 'node:child_process';

const command = process.argv.slice(2).join(' ');

const { status, stdout } = spawnSync(`{ ${command}; } 2>&1`, {
	encoding: 'utf8',
	maxBuffer: Infinity,
	shell: true,
});

if (status !== 0) {
	process.stdout.write(stdout);
	process.exitCode = status ?? 1;
}
