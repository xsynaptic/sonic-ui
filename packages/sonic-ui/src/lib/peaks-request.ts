/** Return the same promise for a span already on its way; a new promise per call repaints forever */
export type PeaksRequest = (
	fromSeconds: number,
	toSeconds: number,
) => Iterable<Promise<unknown>> | Promise<unknown> | undefined;

interface PeaksAsker {
	ask: (request: PeaksRequest | undefined, wanted: [number, number] | undefined) => void;
	changed: () => void;
	reset: () => void;
}

export function createPeaksRequest(repaint: () => void): PeaksAsker {
	const awaited = new WeakSet<Promise<unknown>>();
	let askedKey: string | undefined;
	let isAsking = false;

	// A write from inside the consumer's call repaints without asking for the same window again
	const changed = (): void => {
		if (!isAsking) askedKey = undefined;
		repaint();
	};
	const changedAfter = async (asked: Promise<unknown>): Promise<void> => {
		await Promise.allSettled([asked]);
		changed();
	};

	const call = (request: PeaksRequest | undefined, wanted: [number, number]) => {
		isAsking = true;
		try {
			return request?.(...wanted);
		} finally {
			isAsking = false;
		}
	};

	return {
		ask: (request, wanted) => {
			const key = wanted?.join(':');
			if (!wanted || key === askedKey) return;

			askedKey = key;

			const asked = call(request, wanted);
			const promises = asked instanceof Promise ? [asked] : (asked ?? []);

			for (const promise of promises) {
				if (awaited.has(promise)) continue;

				awaited.add(promise);
				void changedAfter(promise);
			}
		},
		changed,
		reset: () => {
			askedKey = undefined;
			repaint();
		},
	};
}
