import { clampUnit } from '#lib/math.ts';

interface CrossfadeOptions {
	law?: 'linear' | 'power';
	sharpness?: number;
}

interface CrossfadeGains {
	a: number;
	b: number;
}

function progress(side: number, span: number): number {
	if (span === 0) return side > 0 ? 1 : 0;

	return Math.min(1, side / span);
}

export function crossfadeGains(position: number, options: CrossfadeOptions = {}): CrossfadeGains {
	const at = clampUnit(position);
	const span = 1 - clampUnit(options.sharpness ?? 0);
	const gain = (side: number): number => {
		const reached = progress(side, span);

		return options.law === 'linear' ? reached : Math.sin((reached * Math.PI) / 2);
	};

	return { a: gain(1 - at), b: gain(at) };
}
