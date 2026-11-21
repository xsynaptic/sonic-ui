export interface Oklch {
	chroma: number;
	/** In degrees, and meaningless when the chroma is 0 */
	hue: number;
	lightness: number;
}

export type Rgb = readonly [red: number, green: number, blue: number];

const encoded = Uint8Array.from({ length: 4096 }, (_byte, index) => {
	const linear = index / 4095;
	const gamma = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;

	return Math.round(gamma * 255);
});

const decoded = Float64Array.from({ length: 256 }, (_linear, byte) => {
	const gamma = byte / 255;

	return gamma <= 0.04045 ? gamma / 12.92 : ((gamma + 0.055) / 1.055) ** 2.4;
});

function encode(linear: number): number {
	if (!(linear > 0)) return 0;

	return encoded[Math.round(Math.min(1, linear) * 4095)] ?? 255;
}

export function oklchOf([red, green, blue]: Rgb): Oklch {
	const r = decoded[red] ?? 0;
	const g = decoded[green] ?? 0;
	const b = decoded[blue] ?? 0;
	const long = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const medium = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const short = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
	const bAxis = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;

	return {
		chroma: Math.hypot(a, bAxis),
		hue: (Math.atan2(bAxis, a) * 180) / Math.PI,
		lightness: 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short,
	};
}

// A colour outside sRGB has each channel clipped, which is what a canvas does with such a colour
export function rgbOf({ chroma, hue, lightness }: Oklch): Rgb {
	const radians = (hue * Math.PI) / 180;
	const a = chroma * Math.cos(radians);
	const b = chroma * Math.sin(radians);
	const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

	return [
		encode(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short),
		encode(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short),
		encode(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short),
	];
}

/**
 * Lightness and chroma blend in OKLCH, so a blend keeps its colourfulness
 * Hue comes from the OKLab blend, so a grey end pulls no hue of its own and nothing jumps as chroma nears zero
 * Two stops nearly opposite in hue have no path between them and flip near the middle, so such a palette needs a stop between
 */
export function blendOklch(from: Oklch, to: Oklch, share: number): Oklch {
	if (!(share > 0)) return from;
	if (share >= 1) return to;

	const radians = Math.PI / 180;
	const a =
		(1 - share) * from.chroma * Math.cos(from.hue * radians) +
		share * to.chroma * Math.cos(to.hue * radians);
	const b =
		(1 - share) * from.chroma * Math.sin(from.hue * radians) +
		share * to.chroma * Math.sin(to.hue * radians);

	return {
		chroma: from.chroma + (to.chroma - from.chroma) * share,
		hue: (Math.atan2(b, a) / radians + 360) % 360,
		lightness: from.lightness + (to.lightness - from.lightness) * share,
	};
}
