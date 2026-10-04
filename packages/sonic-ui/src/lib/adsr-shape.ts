import { envelopeCurve } from '#lib/envelope-curve.ts';
import { roundTo } from '#lib/math.ts';

export const adsrStages = ['delay', 'attack', 'hold', 'decay', 'sustain', 'release'] as const;

export const timeStages = ['delay', 'attack', 'hold', 'decay', 'release'] as const;

type AdsrStage = (typeof adsrStages)[number];

type TimeStage = (typeof timeStages)[number];

export type AdsrProportions = Partial<Record<AdsrStage, number | undefined>>;

export type AdsrCurves = Partial<Record<TimeStage, number | undefined>>;

interface AdsrPoint {
	x: number;
	y: number;
}

interface AdsrHandle extends AdsrPoint {
	stage: TimeStage;
}

export interface AdsrShape {
	curveHandles: Array<AdsrHandle>;
	handles: Array<AdsrHandle>;
	points: Array<AdsrPoint>;
	share: number;
}

const curveSamples = 24;

function along(from: AdsrPoint, to: AdsrPoint, at: { curve: number; position: number }): AdsrPoint {
	return {
		x: from.x + (to.x - from.x) * at.position,
		y: from.y + (to.y - from.y) * envelopeCurve(at.position, at.curve),
	};
}

function curved(from: AdsrPoint, to: AdsrPoint, curve: number): Array<AdsrPoint> {
	if (envelopeCurve(0.5, curve) === 0.5) return [];

	return Array.from({ length: curveSamples - 1 }, (_, index) =>
		along(from, to, { curve, position: (index + 1) / curveSamples }),
	);
}

function leg(
	from: AdsrPoint,
	to: AdsrPoint,
	curve: number | undefined,
): { curveHandle: AdsrPoint | undefined; points: Array<AdsrPoint> } {
	if (curve === undefined) return { curveHandle: undefined, points: [to] };

	return {
		curveHandle: along(from, to, { curve, position: 0.5 }),
		points: [...curved(from, to, curve), to],
	};
}

function isHandled(proportions: AdsrProportions, stage: TimeStage): boolean {
	const proportion =
		stage === 'decay' ? (proportions.sustain ?? proportions.decay) : proportions[stage];

	return proportion !== undefined;
}

export function adsrShape(proportions: AdsrProportions, curves: AdsrCurves = {}): AdsrShape {
	const sustain = proportions.sustain ?? 1;
	const levels = { attack: 1, decay: sustain, delay: 0, hold: 1, release: 0 };
	const share = 1 / (timeStages.filter((stage) => proportions[stage] !== undefined).length + 1);
	const shape: AdsrShape = { curveHandles: [], handles: [], points: [{ x: 0, y: 0 }], share };
	let from = { x: 0, y: 0 };

	for (const stage of timeStages) {
		if (stage === 'release') {
			from = { x: from.x + share, y: sustain };
			shape.points.push(from);
		}

		const to = { x: from.x + (proportions[stage] ?? 0) * share, y: levels[stage] };
		const { curveHandle, points } = leg(from, to, curves[stage]);

		shape.points.push(...points);
		if (curveHandle) shape.curveHandles.push({ ...curveHandle, stage });
		if (isHandled(proportions, stage)) shape.handles.push({ ...to, stage });
		from = to;
	}

	return shape;
}

export function adsrPath({ points }: AdsrShape): {
	fill: string;
	floor: { from: number; to: number };
	stroke: string;
} {
	const stroke = points
		.map(
			({ x, y }, index) =>
				`${index === 0 ? 'M' : 'L'}${String(roundTo(x, 4))} ${String(roundTo(1 - y, 4))}`,
		)
		.join('');

	const floor = {
		from: roundTo(points[0]?.x ?? 0, 4),
		to: roundTo(points.at(-1)?.x ?? 0, 4),
	};

	return { fill: `${stroke}Z`, floor, stroke };
}
