function defineStops<Value extends string>(stops: ReadonlyArray<{ label: string; value: Value }>) {
	return {
		labels: stops.map((stop) => stop.label),
		positions: stops.map((_stop, index) => String(index)).join(' '),
		valueAt: (index: number): undefined | Value => stops[index]?.value,
	};
}

export const echoModes = defineStops([
	{ label: 'Single', value: 'single' },
	{ label: 'Dual', value: 'dual' },
	{ label: 'Ping-pong', value: 'ping-pong' },
	{ label: 'Rhythm', value: 'rhythm' },
]);

export const channelCurves = defineStops([
	{ label: 'Gentle', value: 'gentle' },
	{ label: 'Medium', value: 'medium' },
	{ label: 'Sharp', value: 'sharp' },
]);

export const filterTypes = defineStops([
	{ label: 'LP', value: 'lp' },
	{ label: 'BP', value: 'bp' },
	{ label: 'HP', value: 'hp' },
	{ label: 'Notch', value: 'notch' },
]);

export const tapeStyles = defineStops([
	{ label: 'Clean', value: 'clean' },
	{ label: 'Tape', value: 'tape' },
	{ label: 'Worn tape', value: 'worn-tape' },
	{ label: 'Analog', value: 'analog' },
	{ label: 'Lo-fi', value: 'lo-fi' },
	{ label: 'Radio', value: 'radio' },
]);
