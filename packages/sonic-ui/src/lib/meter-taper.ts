import type { Decibels } from '#lib/units.ts';

import { clampProportion } from '#lib/math.ts';

// A slope with bends, which a `calc()` writes as a sum of `max(0, …)` terms
interface Law {
	bends: ReadonlyArray<{ at: Decibels; by: number }>;
	slope: number;
}

export const meterTapers = ['linear', 'iec'] as const;

export type MeterTaper = (typeof meterTapers)[number];

// IEC 60268-18's deflection, as Ardour's and JACK's meters draw it; past either end its end slope carries on
const iecDeflection = [
	[-70, 0],
	[-60, 0.025],
	[-50, 0.075],
	[-40, 0.15],
	[-30, 0.3],
	[-20, 0.5],
	[0, 1],
] as const;

function lawThrough(points: ReadonlyArray<readonly [Decibels, number]>): Law {
	const slopes = points.slice(1).map(([at, share], index) => {
		const [fromAt, fromShare] = points[index] ?? [at, share];

		return (share - fromShare) / (at - fromAt);
	});

	return {
		bends: slopes.slice(1).map((slope, index) => ({
			at: points[index + 1]?.[0] ?? 0,
			by: slope - (slopes[index] ?? 0),
		})),
		slope: slopes[0] ?? 1,
	};
}

const laws: Record<MeterTaper, Law> = {
	iec: lawThrough(iecDeflection),
	linear: { bends: [], slope: 1 },
};

function deflection({ bends, slope }: Law, decibels: Decibels): number {
	let total = slope * decibels;

	for (const { at, by } of bends) total += by * Math.max(0, decibels - at);

	return total;
}

function deflectionCss({ bends, slope }: Law, expression: string): string {
	const terms = bends.map(
		({ at, by }) => ` + ${String(by)} * max(0, ${expression} - (${String(at)}))`,
	);

	return `${String(slope)} * ${expression}${terms.join('')}`;
}

export function meterScale(
	taper: MeterTaper,
	min: Decibels,
	max: Decibels,
): { proportionCss: (expression: string) => string; proportionOf: (decibels: Decibels) => number } {
	const law = laws[taper];
	const floor = deflection(law, min);
	const span = deflection(law, max) - floor;

	return {
		proportionCss: (expression) =>
			span > 0
				? `clamp(0, (${deflectionCss(law, expression)} - (${String(floor)})) / ${String(span)}, 1)`
				: '0',
		proportionOf: (decibels) =>
			span > 0 ? clampProportion((deflection(law, decibels) - floor) / span) : 0,
	};
}
