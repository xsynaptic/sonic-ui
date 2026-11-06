const sign = /^[-−]/;

// A time not yet known writes as nothing, the text `parseClock` reads back as NaN
export function formatClock(seconds: number): string {
	if (!Number.isFinite(seconds)) return '';

	const total = Math.floor(Math.abs(seconds));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor(total / 60) % 60;
	const rest = String(total % 60).padStart(2, '0');
	const prefix = seconds < 0 ? '−' : '';

	if (hours === 0) return `${prefix}${String(minutes)}:${rest}`;

	return `${prefix}${String(hours)}:${String(minutes).padStart(2, '0')}:${rest}`;
}

const clockPattern = /^[-−]?\d+(?::[0-5]?\d){0,2}(?:\.\d+)?$/;

export function parseClock(text: string): number {
	const clock = text.trim();
	if (!clockPattern.test(clock)) return NaN;

	let seconds = 0;

	for (const part of clock.replace(sign, '').split(':')) seconds = seconds * 60 + Number(part);

	return sign.test(clock) ? -seconds : seconds;
}
