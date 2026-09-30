const counts = new Map<string, number>();

for (const ghost of document.querySelectorAll<HTMLElement>('[data-ghost]')) {
	const name = ghost.dataset.ghost ?? '';

	counts.set(name, (counts.get(name) ?? 0) + 1);
}

const total = counts.values().reduce((sum, count) => sum + count, 0);
const entries = [...counts].toSorted(([, first], [, second]) => second - first);

for (const tally of document.querySelectorAll('[data-ghost-tally]')) {
	tally.replaceChildren(
		...[['Ghosts', total] as const, ...entries].map(([name, count]) => {
			const item = document.createElement('li');

			item.textContent = `${name} ${String(count)}`;

			return item;
		}),
	);
}
