export const divisions = {
	dot: [4.5, 9, 18, 36, 72, 144],
	note: [3, 6, 12, 24, 48, 96, 192],
	trip: [2, 4, 8, 16, 32, 64, 128],
} as const;

export type Division = 'time' | keyof typeof divisions;

export const divisionOrder: Array<{ label: string; value: Division }> = [
	{ label: 'Time', value: 'time' },
	{ label: 'Note', value: 'note' },
	{ label: 'Dot', value: 'dot' },
	{ label: 'Trip', value: 'trip' },
];

export const timeRange = { max: 2000, min: 10 } as const;
