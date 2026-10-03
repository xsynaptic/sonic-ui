import { envelopeCurve } from '#lib/envelope-curve.ts';
import { roundTo } from '#lib/math.ts';

export const adsrStages = ['delay', 'attack', 'hold', 'decay', 'sustain', 'release'] as const;

export const timeStages = ['delay', 'attack', 'hold', 'decay', 'release'] as const;

type AdsrStage = (typeof adsrStages)[number];

type TimeStage = (typeof timeStages)[number];

export type AdsrPlaces = Partial<Record<AdsrStage, number | undefined>>;

export type AdsrBends = Partial<Record<TimeStage, number | undefined>>;

interface AdsrPoint {
	x: number;
	y: number;
}

interface AdsrHandle extends AdsrPoint {
	stage: TimeStage;
}

export interface AdsrShape {
	dots: Array<AdsrHandle>;
	handles: Array<AdsrHandle>;
	points: Array<AdsrPoint>;
	share: number;
}

const curveSegments = 24;

function along(from: AdsrPoint, to: AdsrPoint, at: { bend: number; position: number }): AdsrPoint {
	return {
		x: from.x + (to.x - from.x) * at.position,
		y: from.y + (to.y - from.y) * envelopeCurve(at.position, at.bend),
	};
}

function bent(from: AdsrPoint, to: AdsrPoint, bend: number): Array<AdsrPoint> {
	if (envelopeCurve(0.5, bend) === 0.5) return [];

	return Array.from({ length: curveSegments - 1 }, (_, index) =>
		along(from, to, { bend, position: (index + 1) / curveSegments }),
	);
}

function segment(
	from: AdsrPoint,
	to: AdsrPoint,
	bend: number | undefined,
): { dot: AdsrPoint | undefined; points: Array<AdsrPoint> } {
	if (bend === undefined) return { dot: undefined, points: [to] };

	return {
		dot: along(from, to, { bend, position: 0.5 }),
		points: [...bent(from, to, bend), to],
	};
}

function isHandled(places: AdsrPlaces, stage: TimeStage): boolean {
	const place = stage === 'decay' ? (places.sustain ?? places.decay) : places[stage];

	return place !== undefined;
}

export function adsrShape(places: AdsrPlaces, bends: AdsrBends = {}): AdsrShape {
	const sustain = places.sustain ?? 1;
	const levels = { attack: 1, decay: sustain, delay: 0, hold: 1, release: 0 };
	const share = 1 / (timeStages.filter((stage) => places[stage] !== undefined).length + 1);
	const shape: AdsrShape = { dots: [], handles: [], points: [{ x: 0, y: 0 }], share };
	let from = { x: 0, y: 0 };

	for (const stage of timeStages) {
		if (stage === 'release') {
			from = { x: from.x + share, y: sustain };
			shape.points.push(from);
		}

		const to = { x: from.x + (places[stage] ?? 0) * share, y: levels[stage] };
		const { dot, points } = segment(from, to, bends[stage]);

		shape.points.push(...points);
		if (dot) shape.dots.push({ ...dot, stage });
		if (isHandled(places, stage)) shape.handles.push({ ...to, stage });
		from = to;
	}

	return shape;
}

export function adsrPath({ points }: AdsrShape): { fill: string; stroke: string } {
	const stroke = points
		.map(
			({ x, y }, index) =>
				`${index === 0 ? 'M' : 'L'}${String(roundTo(x, 4))} ${String(roundTo(1 - y, 4))}`,
		)
		.join('');

	return { fill: `${stroke}Z`, stroke };
}
