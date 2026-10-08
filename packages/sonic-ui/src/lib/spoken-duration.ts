import { formatClock } from '#lib/clock.ts';

const formatters = new Map<string, Intl.DurationFormat>();

function formatterFor(language: string, isZero: boolean): Intl.DurationFormat {
	const key = `${language}|${String(isZero)}`;
	const cached = formatters.get(key);
	if (cached) return cached;

	// All-zero units format to an empty string unless the seconds are forced
	const options = { secondsDisplay: isZero ? 'always' : 'auto', style: 'long' } as const;
	let formatter: Intl.DurationFormat;

	try {
		formatter = new Intl.DurationFormat(language || undefined, options);
	} catch {
		formatter = new Intl.DurationFormat(undefined, options);
	}
	formatters.set(key, formatter);

	return formatter;
}

export function spokenDuration(seconds: number, language = ''): string {
	if (!('DurationFormat' in Intl)) return formatClock(seconds);

	// Truncated as the clock is, so every unit carries one sign; mixed signs throw
	const total = Math.trunc(seconds);

	return formatterFor(language, total === 0).format({
		hours: Math.trunc(total / 3600),
		minutes: Math.trunc(total / 60) % 60,
		seconds: total % 60,
	});
}
