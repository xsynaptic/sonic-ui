// Keyed by a control's connection signal, so every gesture bound with it is found without a list kept by hand
const releases = new WeakMap<AbortSignal, Set<() => void>>();

export function onLetGo(signal: AbortSignal, release: () => void): void {
	const bound = releases.get(signal);
	if (bound) {
		bound.add(release);
		return;
	}

	releases.set(signal, new Set([release]));
}

export function letGo(signal: AbortSignal): void {
	const bound = releases.get(signal);
	if (!bound) return;

	for (const release of bound) release();
}
