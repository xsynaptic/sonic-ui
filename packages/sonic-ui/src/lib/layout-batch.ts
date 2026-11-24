export interface LayoutPass {
	measure: () => () => void;
	prepare: () => void;
}

const queued = new Map<object, () => LayoutPass>();

// Any insertion inside a control restyles the page through its `:has()` rules, so all writes precede all reads
function flush(): void {
	const plans = [...queued.values()];

	queued.clear();

	const passes = plans.map((plan) => plan());

	for (const pass of passes) pass.prepare();

	const writes = passes.map((pass) => pass.measure());

	for (const write of writes) write();
}

export function runLayoutPass(pass: LayoutPass): void {
	pass.prepare();
	pass.measure()();
}

export function queueLayout(owner: object, plan: () => LayoutPass): void {
	if (queued.size === 0) queueMicrotask(flush);
	queued.set(owner, plan);
}
