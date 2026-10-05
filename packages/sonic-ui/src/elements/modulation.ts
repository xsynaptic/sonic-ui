import type { ValueMapping } from '#lib/value-mapping.ts';

import { toNumber } from '#lib/math.ts';

interface Modulation {
	draw: (drawn: ModulationDraw) => void;
	value: () => number | undefined;
	write: (next: null | number | undefined, mapping: undefined | ValueMapping) => void;
}

interface ModulationDraw {
	mapping: ValueMapping;
	modulation: number;
	origin: number;
	value: number;
}

export function createModulation(
	control: HTMLElement,
	prefix: 'dial' | 'slider',
	toggle: (isModulated: boolean) => void,
): Modulation {
	const { style } = control;
	let isModulated = false;
	let modulationValue: number | undefined;

	const writeProportion = (mapping: ValueMapping): void => {
		const shown = mapping.isWrapping ? undefined : modulationValue;
		const isShown = shown !== undefined;

		if (isShown !== isModulated) {
			isModulated = isShown;
			toggle(isShown);
		}
		if (shown === undefined) {
			style.removeProperty(`--_sonic-${prefix}-modulation-value`);
			return;
		}

		style.setProperty(`--_sonic-${prefix}-modulation-value`, String(mapping.proportionOf(shown)));
	};

	return {
		draw: ({ mapping, modulation, origin, value }) => {
			const at = mapping.proportionOf(value);
			const reach = mapping.proportionOf(value + modulation);
			const { positionCount } = mapping;

			style.setProperty(`--_sonic-${prefix}-value`, String(at));
			style.setProperty(`--_sonic-${prefix}-origin`, String(mapping.proportionOf(origin)));
			style.setProperty(`--_sonic-${prefix}-modulation-from`, String(Math.min(at, reach)));
			style.setProperty(`--_sonic-${prefix}-modulation-to`, String(Math.max(at, reach)));
			if (positionCount === undefined) style.removeProperty(`--_sonic-${prefix}-position-count`);
			else style.setProperty(`--_sonic-${prefix}-position-count`, String(positionCount));
			writeProportion(mapping);
		},
		value: () => modulationValue,
		// No mapping before the control is drawn; the value is held until then
		write: (next, mapping) => {
			const value = next === undefined || next === null ? undefined : toNumber(next);
			if (value !== undefined && !Number.isFinite(value)) return;

			modulationValue = value;
			if (mapping) writeProportion(mapping);
		},
	};
}
